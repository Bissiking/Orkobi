import { Inject, Injectable } from '@nestjs/common';
import { createId } from '@orkobi/contracts';
import type {
  OrganizationContext,
  PermissionKey,
  Result,
  UserSummary,
  OrganizationSummary,
} from '@orkobi/sdk-types';
import { CoreDatabase } from '../database.service.js';

/** Services internes pour un contexte établi par le Core ; jamais une identité du navigateur. */
@Injectable()
export class PersistentCoreServices {
  constructor(@Inject(CoreDatabase) private readonly database: CoreDatabase) {}
  private async read<T>(
    context: OrganizationContext,
    operation: (value: { userName: string; orgName: string; permissions: readonly string[] }) => T,
  ): Promise<Result<T>> {
    try {
      const repository = await this.database.repository();
      return await repository.transaction(async (repo) => {
        await repo.lockAdministration();
        const user = await repo.user(context.userId),
          org = await repo.organization(context.organizationId),
          member = await repo.membership(context.organizationId, context.userId);
        if (!user?.active || !org?.active || !member?.active)
          return { ok: false, error: { code: 'forbidden', message: 'Accès refusé.' } };
        const role = await repo.role(context.organizationId, member.roleId);
        if (!role) return { ok: false, error: { code: 'forbidden', message: 'Accès refusé.' } };
        return {
          ok: true,
          value: operation({
            userName: user.name,
            orgName: org.name,
            permissions: role.permissions,
          }),
        };
      });
    } catch {
      return {
        ok: false,
        error: {
          code: 'unavailable',
          message: 'Service indisponible.',
          ...(context.correlationId ? { correlationId: context.correlationId } : {}),
        },
      };
    }
  }
  currentUser(context: OrganizationContext): Promise<Result<UserSummary>> {
    return this.read(context, (value) => ({
      id: createId<'user'>(context.userId),
      displayName: value.userName,
    }));
  }
  currentOrganization(context: OrganizationContext): Promise<Result<OrganizationSummary>> {
    return this.read(context, (value) => ({
      id: createId<'organization'>(context.organizationId),
      name: value.orgName,
    }));
  }
  can(context: OrganizationContext, permission: PermissionKey): Promise<Result<boolean>> {
    return this.read(context, (value) => value.permissions.includes(permission));
  }
}
