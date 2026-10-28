// tests/types/contracts.ts
import { createId } from '@orkobi/contracts';
import type { Membership } from '@orkobi/identity';
import type { DatabaseAdapter } from '@orkobi/database';
import type { EventPublisher } from '@orkobi/events';
import type { CoreSdk } from '@orkobi/sdk-core';
import type { OrganizationContext, UserId, Result, ModuleRequirements } from '@orkobi/sdk-types';

const organizationId = createId<'organization'>('org-a');
const userId = createId<'user'>('user-a');
export const context: OrganizationContext = { organizationId, userId };

// @ts-expect-error Un identifiant d'organisation ne doit pas devenir un utilisateur.
export const invalidUserId: UserId = organizationId;

// @ts-expect-error Le SDK public n'expose pas l'adaptateur SQL interne.
import type { DatabaseAdapter as PublicDatabase } from '@orkobi/sdk-types';
// @ts-expect-error Le SDK public n'expose pas de constructeur d'identifiants.
import { createId as publicCreateId } from '@orkobi/sdk-types';
// @ts-expect-error Les sous-chemins internes sont privés.
import type { Id } from '@orkobi/contracts/src/index.js';

export type { PublicDatabase, Id };
export { publicCreateId };

export const membership: Membership = {
  id: createId<'membership'>('membership-a'), ...context,
  status: 'active', roleIds: [createId<'role'>('reader')],
};

export const requirements: ModuleRequirements = {
  moduleId: createId<'module'>('contacts'),
  capabilities: [{ key: 'core.identity', required: true }],
  permissions: [{ key: 'contacts:read', description: 'Lire les contacts' }],
};

export async function consume(sdk: CoreSdk): Promise<Result<boolean>> {
  // @ts-expect-error Aucun accès SQL brut dans le SDK.
  void sdk.database;
  return sdk.permissions.can('contacts:read');
}

export function errorMessage(result: Result<UserId>): string {
  return result.ok ? result.value : result.error.message;
}

export async function useDatabase(adapter: DatabaseAdapter): Promise<number> {
  return adapter.transaction(context, async (transaction) => {
    const result = await transaction.execute<{ count: number }>({ text: 'SELECT 1 AS count', parameters: [] });
    return result.rowCount;
  });
}

export async function publish(publisher: EventPublisher): Promise<void> {
  await publisher.publish(context, {
    id: createId<'event'>('event-a'), name: 'contacts.created', version: 1,
    organizationId, source: requirements.moduleId,
    occurredAt: '2026-10-28T00:00:00.000Z', payload: { contactId: 'contact-a' },
  });
}
