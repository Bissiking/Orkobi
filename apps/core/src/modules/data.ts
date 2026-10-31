import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createId, isModuleManifest } from '@orkobi/contracts';
import type {
  ModuleEntityDeclaration,
  ModuleEntry,
  ModuleManifest,
  OrganizationContext,
} from '@orkobi/contracts';
import type { ModuleDataOwner, PlatformTransaction, StoredModule } from '@orkobi/database';

type Body = Record<string, unknown>;
const entryIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;

interface EntryRow extends Record<string, unknown> {
  id: string;
  created_at: Date;
  updated_at: Date;
}

function entityOf(manifest: ModuleManifest, entity: string): ModuleEntityDeclaration {
  const declaration = manifest.entities.find((item) => item.entity === entity);
  if (!declaration) throw new NotFoundException();
  return declaration;
}
function ownerOf(moduleId: string, manifest: ModuleManifest): ModuleDataOwner {
  return {
    moduleId,
    tables: manifest.entities.map((entity) => entity.table),
  };
}
function contextOf(organizationId: string, userId: string): OrganizationContext {
  return {
    organizationId: createId<'organization'>(organizationId),
    userId: createId<'user'>(userId),
  };
}
function mapEntry(entity: ModuleEntityDeclaration, row: EntryRow): ModuleEntry {
  const values: Record<string, string> = {};
  for (const field of entity.fields) values[field.name] = String(row[field.name] ?? '');
  return {
    id: row.id,
    values,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
function fieldValues(entity: ModuleEntityDeclaration, input: Body): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of entity.fields) {
    const value = input[field.name];
    if (value === undefined || value === null) {
      if (field.required) throw new BadRequestException();
      values[field.name] = '';
      continue;
    }
    if (typeof value !== 'string') throw new BadRequestException();
    const trimmed = value.trim();
    const max = field.max ?? 4000;
    if (field.required && !trimmed) throw new BadRequestException();
    if ([...trimmed].length > max) throw new BadRequestException();
    if (
      [...trimmed].some(
        (character) => character.charCodeAt(0) < 32 && character !== '\n' && character !== '\t',
      )
    )
      throw new BadRequestException();
    values[field.name] = trimmed;
  }
  for (const key of Object.keys(input)) {
    if (!entity.fields.some((field) => field.name === key)) throw new BadRequestException();
  }
  return values;
}

/** Accès générique aux entités déclarées, borné aux modules actifs de l'organisation. */
@Injectable()
export class ModuleDataService {
  private async authorized(
    repo: PlatformTransaction,
    organizationId: string,
    userId: string,
    moduleId: string,
    entity: string,
    access: 'read' | 'write',
  ) {
    const module: StoredModule | undefined = await repo.module(moduleId);
    if (!module?.manifest || !isModuleManifest(module.manifest)) throw new NotFoundException();
    const manifest = module.manifest;
    const declaration = entityOf(manifest, entity);
    const activations = await repo.organizationModules(organizationId);
    const member = await repo.membership(organizationId, userId);
    const organization = await repo.organization(organizationId);
    if (!module.enabled || !activations.some((item) => item.moduleId === moduleId && item.enabled))
      throw new ForbiddenException();
    if (!organization?.active || !member?.active) throw new ForbiddenException();
    const role = await repo.role(organizationId, member.roleId);
    if (!role?.permissions.includes(access === 'read' ? declaration.read : declaration.write))
      throw new ForbiddenException();
    return { module, manifest, declaration };
  }

  async list(
    repo: PlatformTransaction,
    organizationId: string,
    userId: string,
    moduleId: string,
    entity: string,
  ): Promise<{ entries: ModuleEntry[] }> {
    const { module, manifest, declaration } = await this.authorized(
      repo,
      organizationId,
      userId,
      moduleId,
      entity,
      'read',
    );
    const fields = declaration.fields.map((field) => field.name).join(', ');
    const transaction = await repo.moduleData(
      ownerOf(module.id, manifest),
      contextOf(organizationId, userId),
    );
    const result = await transaction.execute<EntryRow>({
      text: `SELECT id, ${fields}, created_at, updated_at FROM ${declaration.table} WHERE organization_id = $1 ORDER BY created_at DESC, id LIMIT 100`,
      parameters: [organizationId],
    });
    return { entries: result.rows.map((row) => mapEntry(declaration, row)) };
  }

  async create(
    repo: PlatformTransaction,
    organizationId: string,
    userId: string,
    moduleId: string,
    entity: string,
    input: Body,
  ): Promise<{ entry: ModuleEntry }> {
    const { module, manifest, declaration } = await this.authorized(
      repo,
      organizationId,
      userId,
      moduleId,
      entity,
      'write',
    );
    const values = fieldValues(declaration, input);
    const fields = declaration.fields.map((field) => field.name);
    const id = randomUUID();
    const transaction = await repo.moduleData(
      ownerOf(module.id, manifest),
      contextOf(organizationId, userId),
    );
    const result = await transaction.execute<EntryRow>({
      text: `INSERT INTO ${declaration.table} (id, organization_id, created_by, ${fields.join(', ')})
            VALUES ($1, $2, $3, ${fields.map((_, index) => `$${index + 4}`).join(', ')})
            RETURNING id, ${fields.join(', ')}, created_at, updated_at`,
      parameters: [id, organizationId, userId, ...fields.map((field) => values[field]!)],
    });
    const row = result.rows[0]!;
    await repo.audit(
      randomUUID(),
      userId,
      `module.${moduleId}.${entity}.created`,
      organizationId,
      id,
    );
    return { entry: mapEntry(declaration, row) };
  }

  async update(
    repo: PlatformTransaction,
    organizationId: string,
    userId: string,
    moduleId: string,
    entity: string,
    entryId: string,
    input: Body,
  ): Promise<{ entry: ModuleEntry }> {
    if (!entryIdPattern.test(entryId)) throw new BadRequestException();
    const { module, manifest, declaration } = await this.authorized(
      repo,
      organizationId,
      userId,
      moduleId,
      entity,
      'write',
    );
    const values = fieldValues(declaration, input);
    const fields = declaration.fields.map((field) => field.name);
    const assignments = fields.map((field, index) => `${field}=$${index + 3}`).join(', ');
    const transaction = await repo.moduleData(
      ownerOf(module.id, manifest),
      contextOf(organizationId, userId),
    );
    const result = await transaction.execute<EntryRow>({
      text: `UPDATE ${declaration.table} SET ${assignments}, updated_at=now()
            WHERE id=$1 AND organization_id=$2
            RETURNING id, ${fields.join(', ')}, created_at, updated_at`,
      parameters: [entryId, organizationId, ...fields.map((field) => values[field]!)],
    });
    const row = result.rows[0];
    if (!row) throw new NotFoundException();
    await repo.audit(
      randomUUID(),
      userId,
      `module.${moduleId}.${entity}.updated`,
      organizationId,
      entryId,
    );
    return { entry: mapEntry(declaration, row) };
  }

  async remove(
    repo: PlatformTransaction,
    organizationId: string,
    userId: string,
    moduleId: string,
    entity: string,
    entryId: string,
  ): Promise<{ success: true }> {
    if (!entryIdPattern.test(entryId)) throw new BadRequestException();
    const { module, manifest, declaration } = await this.authorized(
      repo,
      organizationId,
      userId,
      moduleId,
      entity,
      'write',
    );
    const transaction = await repo.moduleData(
      ownerOf(module.id, manifest),
      contextOf(organizationId, userId),
    );
    const result = await transaction.execute({
      text: `DELETE FROM ${declaration.table} WHERE id=$1 AND organization_id=$2`,
      parameters: [entryId, organizationId],
    });
    if (result.rowCount === 0) throw new NotFoundException();
    await repo.audit(
      randomUUID(),
      userId,
      `module.${moduleId}.${entity}.deleted`,
      organizationId,
      entryId,
    );
    return { success: true };
  }
}
