// sdk/core/src/index.ts
import type {
  BusinessModuleKey,
  BusinessRecord,
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

/** API synchrone du moteur isolé ; le pont hôte attend les opérations SQL sans exposer leurs objets. */
export interface PluginSdk {
  readonly execution: { readonly id: string | null; readonly idempotencyKey: string | null };
  readonly context: OrganizationContext;
  readonly identity: {
    currentUser(): Result<UserSummary>;
    currentOrganization(): Result<OrganizationSummary>;
  };
  readonly permissions: { can(permission: PermissionKey): Result<boolean> };
  readonly data: {
    list(entity: string): Result<{ readonly entries: readonly ModuleEntry[] }>;
    create(
      entity: string,
      values: Readonly<Record<string, string>>,
    ): Result<{ readonly entry: ModuleEntry }>;
    update(
      entity: string,
      id: string,
      values: Readonly<Record<string, string>>,
    ): Result<{ readonly entry: ModuleEntry }>;
    remove(entity: string, id: string): Result<{ success: true }>;
  };
  readonly jobs: {
    schedule(input: Omit<ScheduleJob, 'moduleId'>): Result<{ id: string }>;
    list(): Result<readonly JobSummary[]>;
    cancel(id: string): Result<null>;
    retry(id: string): Result<null>;
  };
}
/** Fonctions ES Module synchrones et sans imports runtime ; les types SDK sont effacés au build. */
export type PluginHandler = (sdk: PluginSdk, input: Readonly<Record<string, unknown>>) => unknown;

/** Port réservé aux modules officiels compilés ; absent du guest PluginSdk API 1.
 * L'organisation et l'identité sont établies par le Core, jamais par le module.
 */
export interface BusinessPort {
  readonly today: string;
  uuid(): string;
  canRead(module: BusinessModuleKey): Promise<boolean>;
  get(module: BusinessModuleKey, entity: string, id: string): Promise<BusinessRecord>;
  byReference(
    module: BusinessModuleKey,
    entity: string,
    reference: string,
  ): Promise<BusinessRecord | undefined>;
  related(
    module: BusinessModuleKey,
    entity: string,
    parentId: string,
  ): Promise<readonly BusinessRecord[]>;
  put(
    entity: string,
    input: {
      id: string;
      data: Record<string, unknown>;
      state: string;
      reference?: string | null;
      parentId?: string | null;
      revision?: number;
    },
  ): Promise<BusinessRecord>;
  number(series: string): Promise<string>;
  stockHeld(productId: string, warehouseId?: string): Promise<boolean>;
  prepareFile(value: unknown): Promise<BusinessAttachment>;
  attach(id: string, file: BusinessAttachment): Promise<void>;
}
export interface BusinessAttachment {
  readonly fileName: string;
  readonly mediaType: string;
  readonly contentBase64: string;
  readonly sha256: string;
  readonly size: number;
}
