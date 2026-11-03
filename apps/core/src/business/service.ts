import {
  Inject,
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import {
  businessDefinitions,
  businessDefinition,
  saveBusiness,
  actBusiness,
  BusinessError,
  decimalMinor,
} from '@orkobi/module-business';
import type { BusinessPort, BusinessAttachment } from '@orkobi/sdk-core';
import type { BusinessModuleKey } from '@orkobi/contracts';
import type { PlatformTransaction } from '@orkobi/database';
import { ModuleManager } from '../modules/manager.js';
import { canonical } from '@orkobi/store';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BusinessError('invalid_fields');
  return value as Record<string, unknown>;
};
const problem = (error: BusinessError) =>
  new HttpException(
    { businessReason: error.reason, ...(error.field ? { field: error.field } : {}) },
    error.status,
  );
@Injectable()
export class BusinessService {
  constructor(@Inject(ModuleManager) private readonly modules: ModuleManager) {}
  private async authorize(
    repo: PlatformTransaction,
    organizationId: string,
    userId: string,
    key: BusinessModuleKey,
    access = 'read',
  ) {
    const module = await repo.module(`orkobi.${key}`),
      org = await repo.organization(organizationId),
      user = await repo.user(userId),
      member = await repo.membership(organizationId, userId),
      activations = await repo.organizationModules(organizationId);
    if (
      !module?.enabled ||
      !org?.active ||
      !user?.active ||
      !member?.active ||
      !activations.some((item) => item.moduleId === module.id && item.enabled)
    )
      throw new ForbiddenException();
    const role = await repo.role(organizationId, member.roleId);
    if (
      !role?.permissions.includes(`orkobi.${key}:read`) ||
      (access !== 'read' && !role.permissions.includes(`orkobi.${key}:${access}`))
    )
      throw new ForbiddenException();
  }
  private file(value: unknown): BusinessAttachment {
    const raw = object(value);
    if (
      Object.keys(raw).some((key) => !['fileName', 'mediaType', 'contentBase64'].includes(key)) ||
      typeof raw.fileName !== 'string' ||
      !raw.fileName.trim() ||
      raw.fileName.length > 160 ||
      // eslint-disable-next-line no-control-regex -- Rejet volontaire des caractères de contrôle.
      /[\\/\u0000-\u001f]/u.test(raw.fileName) ||
      typeof raw.mediaType !== 'string' ||
      typeof raw.contentBase64 !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(raw.contentBase64)
    )
      throw new BusinessError('file_invalid');
    if (raw.contentBase64.length > 65536) throw new BusinessError('file_too_large');
    const bytes = Buffer.from(raw.contentBase64, 'base64');
    if (!bytes.length || bytes.length > 49152) throw new BusinessError('file_too_large');
    if (raw.mediaType === 'application/pdf') {
      if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new BusinessError('file_invalid');
    } else if (raw.mediaType === 'image/png') {
      if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
        throw new BusinessError('file_invalid');
    } else if (raw.mediaType === 'image/jpeg') {
      if (bytes.subarray(0, 3).toString('hex') !== 'ffd8ff')
        throw new BusinessError('file_invalid');
    } else if (raw.mediaType === 'text/plain') {
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw new BusinessError('file_invalid');
      }
    } else throw new BusinessError('file_invalid');
    return {
      fileName: raw.fileName,
      mediaType: raw.mediaType,
      contentBase64: bytes.toString('base64'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
    };
  }
  async execute(
    repo: PlatformTransaction,
    userId: string,
    organizationId: string | null,
    method: 'GET' | 'POST',
    path: string,
    body: Record<string, unknown>,
  ) {
    try {
      if (method === 'GET' && path === 'business')
        return {
          definitions: businessDefinitions,
          country: 'FR',
          currency: 'EUR',
          billingProviderAvailable: false,
        };
      if (!organizationId) throw new BadRequestException();
      await this.modules.sync(repo);
      const parts = path.split('/'),
        key = parts[1]!,
        definition = businessDefinition(key);
      if (!definition) throw new NotFoundException();
      const module = definition.key,
        store = repo.business();
      const authCache = new Map<string, Promise<void>>();
      const authorize = (module: BusinessModuleKey, access = 'read') => {
        const cacheKey = `${module}/${access}`;
        let pending = authCache.get(cacheKey);
        if (!pending) {
          pending = this.authorize(repo, organizationId, userId, module, access);
          authCache.set(cacheKey, pending);
        }
        return pending;
      };
      const canRead = async (module: BusinessModuleKey) => {
        try {
          await authorize(module);
          return true;
        } catch (error) {
          if (error instanceof ForbiddenException) return false;
          throw error;
        }
      };
      if (method === 'GET' && module === 'reports') {
        if (parts.length !== 2) throw new NotFoundException();
        await authorize('reports');
        const modules = [];
        for (const d of businessDefinitions)
          if (d.key !== 'reports' && (await canRead(d.key)))
            modules.push({ key: d.key, rows: await store.report(organizationId, d.key) });
        return { modules, currency: 'EUR', generatedAt: new Date().toISOString() };
      }
      const entity = parts[2]!,
        declaration = definition.entities.find((item) => item.key === entity),
        id = parts[3],
        action = parts[4];
      if (!declaration || (id && !uuid.test(id)) || parts.length > 5) throw new NotFoundException();
      await authorize(
        module,
        method === 'GET'
          ? 'read'
          : module === 'hr' && entity === 'leave' && ['approve', 'reject'].includes(action ?? '')
            ? 'approve'
            : 'write',
      );
      const port: BusinessPort = {
        today: new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Paris',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date()),
        uuid: randomUUID,
        canRead,
        get: async (target, kind, id) => {
          await authorize(target);
          if (!uuid.test(id)) throw new BusinessError('invalid_reference');
          const record = await store.get(organizationId, id);
          if (!record || record.module !== target || record.entity !== kind)
            throw new NotFoundException();
          return record;
        },
        byReference: async (target, kind, reference) => {
          await authorize(target);
          return store.byReference(organizationId, target, kind, reference);
        },
        related: async (target, kind, parent) => {
          await authorize(target);
          const records = await store.related(organizationId, parent, kind);
          if (records.length > 1000) throw new BusinessError('record_limit', 409);
          if (records.some((record) => record.module !== target)) throw new ForbiddenException();
          return records;
        },
        put: async (kind, input) => {
          if (!definition.entities.some((e) => e.key === kind)) throw new ForbiddenException();
          await authorize(
            module,
            module === 'hr' &&
              entity === 'leave' &&
              kind === 'leave' &&
              ['approve', 'reject'].includes(action ?? '')
              ? 'approve'
              : 'write',
          );
          const old =
            input.revision !== undefined ? await port.get(module, kind, input.id) : undefined;
          if (old && old.revision !== input.revision)
            throw new BusinessError('revision_conflict', 409);
          if (!old && (await store.count(organizationId, module, kind)) >= 10000)
            throw new BusinessError('record_limit', 409);
          if (
            input.parentId &&
            input.parentId !== old?.parentId &&
            (await store.related(organizationId, input.parentId, kind)).length >= 1000
          )
            throw new BusinessError('record_limit', 409);
          if (!old && (await store.get(organizationId, input.id)))
            throw new BusinessError('revision_conflict', 409);
          const amount =
            kind === 'quotes' || kind === 'invoices'
              ? String(input.data.totalMinor ?? '0')
              : kind === 'dues'
                ? String(decimalMinor(input.data.amount))
                : '0';
          const record = await store.save({
            id: input.id,
            organizationId,
            module,
            entity: kind,
            data: input.data,
            state: input.state,
            reference: input.reference ?? old?.reference ?? null,
            parentId: input.parentId ?? old?.parentId ?? null,
            amountMinor: amount,
            userId,
            ...(input.revision !== undefined ? { revision: input.revision } : {}),
          });
          if (!record) throw new BusinessError('revision_conflict', 409);
          return record;
        },
        number: (series) => store.number(organizationId, series),
        stockHeld: async (productId, warehouseId) => {
          if (!['products', 'stock'].includes(module)) throw new ForbiddenException();
          let cursor: string | undefined;
          do {
            const page = await store.list(organizationId, 'stock', 'balances', cursor);
            if (
              page.records.some(
                (record) =>
                  (!productId || record.data.productId === productId) &&
                  (!warehouseId || record.data.warehouseId === warehouseId) &&
                  BigInt(String(record.data.quantityMilli)) > 0n,
              )
            )
              return true;
            cursor = page.nextCursor ?? undefined;
          } while (cursor);
          return false;
        },
        prepareFile: async (value) => {
          if (module !== 'documents') throw new ForbiddenException();
          const file = this.file(value);
          if ((await store.attachmentBytes(organizationId)) + BigInt(file.size) > 10485760n)
            throw new BusinessError('record_limit', 409);
          return file;
        },
        attach: async (id, file) => {
          if (module !== 'documents') throw new ForbiddenException();
          const record = await port.get('documents', 'files', id);
          const verified = this.file({
            fileName: file.fileName,
            mediaType: file.mediaType,
            contentBase64: file.contentBase64,
          });
          if (record.data.sha256 !== verified.sha256) throw new BusinessError('file_invalid');
          await store.attach(organizationId, id, verified);
        },
      };
      if (method === 'GET') {
        if (action === 'download' && module === 'documents' && entity === 'files' && id) {
          const record = await port.get(module, entity, id),
            file = await store.attachment(organizationId, id);
          if (
            !file ||
            file.sha256 !== record.data.sha256 ||
            createHash('sha256').update(Buffer.from(file.contentBase64, 'base64')).digest('hex') !==
              file.sha256
          )
            throw new NotFoundException();
          await repo.audit(
            randomUUID(),
            userId,
            'business.documents.downloaded',
            organizationId,
            id,
          );
          return { ...file, fileName: record.data.fileName };
        }
        if (action) throw new NotFoundException();
        if (id) return { record: await port.get(module, entity, id) };
        if (Object.keys(body).some((key) => key !== 'cursor'))
          throw new BusinessError('invalid_fields');
        const cursor = typeof body.cursor === 'string' ? body.cursor : undefined;
        if (cursor && !uuid.test(cursor)) throw new BusinessError('invalid_value');
        const page = await store.list(organizationId, module, entity, cursor);
        const visible = new Set([
          ...declaration.columns,
          ...declaration.fields
            .filter((field) => field.type === 'reference')
            .map((field) => field.key),
          'name',
          'title',
          'sku',
          'number',
          'currency',
          'invoiceId',
          'sourceQuoteId',
          'reversalId',
          'reversesId',
        ]);
        return {
          ...page,
          records: page.records.map((record) => ({
            ...record,
            data: Object.fromEntries(
              Object.entries(record.data).filter(([key]) => visible.has(key)),
            ),
          })),
        };
      }
      if (
        Object.keys(body).some(
          (key) =>
            ![
              'values',
              'expectedRevision',
              'idempotencyKey',
              'lines',
              'file',
              'acceptanceReference',
              'reason',
              'paidOn',
              'method',
              'paymentReference',
            ].includes(key),
        )
      )
        throw new BusinessError('invalid_fields');
      if (typeof body.idempotencyKey !== 'string' || !uuid.test(body.idempotencyKey))
        throw new BusinessError('invalid_value');
      const hash = createHash('sha256')
          .update(canonical({ module, entity, id: id ?? null, action: action ?? null, body }))
          .digest('hex'),
        previous = await store.operation(organizationId, userId, body.idempotencyKey);
      if (previous) {
        if (previous.requestHash !== hash) throw new BusinessError('idempotency_conflict', 409);
        return previous.result;
      }
      const record =
        action && id
          ? await actBusiness(port, module, entity, id, action, body)
          : await saveBusiness(port, module, entity, body, id);
      const result = { record };
      await repo.audit(
        randomUUID(),
        userId,
        `business.${module}.${entity}.${action ?? (id ? 'updated' : 'created')}`,
        organizationId,
        record.id,
      );
      await store.commitOperation(organizationId, userId, body.idempotencyKey, hash, result);
      return result;
    } catch (error) {
      if (error instanceof BusinessError) throw problem(error);
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
        throw problem(new BusinessError('duplicate_reference', 409));
      throw error;
    }
  }
  async grant(repo: PlatformTransaction, userId: string, body: Record<string, unknown>) {
    await this.modules.sync(repo);
    const definition = businessDefinition(String(body.module));
    if (
      !definition ||
      typeof body.organizationId !== 'string' ||
      !uuid.test(body.organizationId) ||
      typeof body.roleId !== 'string' ||
      !uuid.test(body.roleId) ||
      !Array.isArray(body.permissions)
    )
      throw new BadRequestException();
    const role = await repo.role(body.organizationId, body.roleId);
    if (!role) throw new NotFoundException();
    if (
      body.permissions.some(
        (key) => !definition.manifest.permissions.some((permission) => permission.key === key),
      )
    )
      throw new ForbiddenException();
    const prefix = `orkobi.${definition.key}:`,
      permissions = [
        ...role.permissions.filter((permission) => !permission.startsWith(prefix)),
        ...new Set(body.permissions as string[]),
      ];
    if (permissions.length > 200) throw new BadRequestException();
    await repo.saveRole(role.id, role.organizationId, role.name, permissions, role.builtin);
    await repo.audit(
      randomUUID(),
      userId,
      'business.permissions_updated',
      body.organizationId,
      definition.manifest.id,
    );
    return { success: true };
  }
}
