import type { ModuleManifest } from './modules.js';
import type { PluginIcon } from './plugins.js';
export type BusinessModuleKey =
  'crm' | 'products' | 'sales' | 'stock' | 'projects' | 'members' | 'documents' | 'reports' | 'hr';
export type BusinessLabel = { readonly fr: string; readonly en: string };
export interface BusinessField {
  readonly key: string;
  readonly label: BusinessLabel;
  readonly type:
    'text' | 'textarea' | 'email' | 'date' | 'money' | 'quantity' | 'select' | 'reference' | 'file';
  readonly required?: boolean;
  readonly max?: number;
  readonly options?: readonly { readonly value: string; readonly label: BusinessLabel }[];
  readonly reference?: { readonly module: BusinessModuleKey; readonly entity: string };
}
export interface BusinessEntity {
  readonly key: string;
  readonly label: BusinessLabel;
  readonly fields: readonly BusinessField[];
  readonly columns: readonly string[];
  readonly readOnly?: boolean;
}
export interface BusinessDefinition {
  readonly key: BusinessModuleKey;
  readonly label: BusinessLabel;
  readonly icon: PluginIcon;
  readonly manifest: ModuleManifest;
  readonly entities: readonly BusinessEntity[];
}
export interface BusinessRecord {
  readonly id: string;
  readonly module: BusinessModuleKey;
  readonly entity: string;
  readonly state: string;
  readonly reference: string | null;
  readonly data: Readonly<Record<string, unknown>>;
  readonly parentId: string | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface BusinessList {
  readonly records: readonly BusinessRecord[];
  readonly nextCursor: string | null;
}
export interface BusinessReport {
  readonly modules: readonly {
    readonly key: BusinessModuleKey;
    readonly rows: readonly {
      readonly entity: string;
      readonly state: string;
      readonly count: number;
      readonly amountMinor: string;
    }[];
  }[];
  readonly currency: 'EUR';
  readonly generatedAt: string;
}
export const businessProblemCodes = [
  'invalid_fields',
  'invalid_value',
  'invalid_reference',
  'duplicate_reference',
  'revision_conflict',
  'invalid_transition',
  'insufficient_stock',
  'already_reversed',
  'project_has_open_tasks',
  'invalid_dates',
  'billing_provider_required',
  'quote_expired',
  'file_invalid',
  'file_too_large',
  'record_limit',
  'idempotency_conflict',
  'profile_required',
] as const;
export type BusinessProblem = (typeof businessProblemCodes)[number];
