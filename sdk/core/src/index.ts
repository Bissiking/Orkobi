// sdk/core/src/index.ts
import type {
  CapabilityKey,
  OrganizationContext,
  OrganizationSummary,
  PermissionKey,
  Result,
  UserSummary,
  ScheduleJob,
  JobSummary,
  ModuleEntry,
} from '@orkobi/sdk-types';

export interface IdentityService {
  currentUser(): Promise<Result<UserSummary>>;
  currentOrganization(): Promise<Result<OrganizationSummary>>;
}

export interface PermissionService {
  /** Vérification informative ; chaque opération du Core doit revérifier les droits. */
  can(permission: PermissionKey): Promise<Result<boolean>>;
}

export interface CapabilityService {
  has(capability: CapabilityKey): Promise<Result<boolean>>;
}
/** Contrat de service lié au module et à l'organisation par le Core.
 * Son raccord pour plugins externes appartient à la Phase 4.
 */
export interface ModuleJobService {
  schedule(input: Omit<ScheduleJob, 'moduleId'>): Promise<Result<{ id: string }>>;
  list(): Promise<Result<readonly JobSummary[]>>;
  cancel(id: string): Promise<Result<void>>;
  retry(id: string): Promise<Result<void>>;
}

/** Façade liée à une organisation et fournie par le Core au module. */
export interface CoreSdk {
  readonly context: OrganizationContext;
  readonly identity: IdentityService;
  readonly permissions: PermissionService;
  readonly capabilities: CapabilityService;
}

/** Handler officiel exécuté avec un contexte et des accès aux données bornés par le Core. */
export interface ModuleTaskExecution {
  readonly id: string;
  readonly context: OrganizationContext;
  readonly signal: TaskSignal;
  readonly idempotencyKey: string;
  readonly data: {
    list(entity: string): Promise<{ readonly entries: readonly ModuleEntry[] }>;
  };
}
export type ModuleTaskHandler = (execution: ModuleTaskExecution) => Promise<void>;

export interface TaskSignal {
  readonly aborted: boolean;
  throwIfAborted(): void;
  addEventListener(
    type: 'abort',
    listener: () => void,
    options?: { readonly once?: boolean },
  ): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}
