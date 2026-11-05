import type { BusinessEntity, BusinessModuleKey, BusinessRecord } from '@orkobi/contracts';
import { formatMinor, stateLabels } from '../business-copy';
export type Locale = 'fr' | 'en';
type Label = { fr: string; en: string };
export const moduleDescriptions: Record<BusinessModuleKey, Label> = {
  crm: {
    fr: 'Contacts, coordonnées et suivi de vos prospects et clients.',
    en: 'Contacts, details and tracking for prospects and customers.',
  },
  products: {
    fr: 'Biens et services, prix unitaires et TVA.',
    en: 'Goods, services, unit prices and VAT.',
  },
  sales: {
    fr: 'Devis et préparations internes de factures non fiscales.',
    en: 'Quotes and internal non-fiscal invoice preparations.',
  },
  stock: {
    fr: 'Entrepôts, entrées, sorties et soldes de stock.',
    en: 'Warehouses, incoming and outgoing movements, and balances.',
  },
  projects: {
    fr: 'Projets, tâches et suivi de leur avancement.',
    en: 'Projects, tasks and progress tracking.',
  },
  members: {
    fr: 'Adhérents, cotisations et règlements de votre association.',
    en: 'Members, membership dues and recorded payments.',
  },
  documents: {
    fr: 'Pièces jointes et documents de votre organisation.',
    en: 'Attachments and documents for your organization.',
  },
  reports: {
    fr: 'Synthèse des données que vous pouvez consulter.',
    en: 'An overview of the data you may read.',
  },
  hr: {
    fr: 'Annuaire administratif et demandes de congé.',
    en: 'Administrative directory and leave requests.',
  },
};
export const entityActions: Record<string, Label> = {
  contacts: { fr: 'Ajouter un contact', en: 'Add contact' },
  products: { fr: 'Ajouter un produit ou service', en: 'Add product or service' },
  profile: { fr: 'Renseigner l’identité commerciale', en: 'Set up business identity' },
  quotes: { fr: 'Créer un devis', en: 'Create quote' },
  warehouses: { fr: 'Ajouter un entrepôt', en: 'Add warehouse' },
  movements: { fr: 'Enregistrer un mouvement', en: 'Record movement' },
  projects: { fr: 'Créer un projet', en: 'Create project' },
  tasks: { fr: 'Ajouter une tâche', en: 'Add task' },
  members: { fr: 'Ajouter un adhérent', en: 'Add member' },
  dues: { fr: 'Créer une cotisation', en: 'Create membership due' },
  files: { fr: 'Déposer un document', en: 'Upload document' },
  employees: { fr: 'Ajouter un salarié', en: 'Add employee' },
  leave: { fr: 'Demander un congé', en: 'Request leave' },
};
const derivedLabels: Record<string, Label> = {
  number: { fr: 'Référence', en: 'Reference' },
  totalMinor: { fr: 'Total TTC', en: 'Total incl. VAT' },
  customerName: { fr: 'Client', en: 'Customer' },
  productName: { fr: 'Produit', en: 'Product' },
  warehouseName: { fr: 'Entrepôt', en: 'Warehouse' },
  memberName: { fr: 'Adhérent', en: 'Member' },
  employeeName: { fr: 'Salarié', en: 'Employee' },
  projectName: { fr: 'Projet', en: 'Project' },
  sourceQuoteNumber: { fr: 'Devis source', en: 'Source quote' },
  fileName: { fr: 'Fichier', en: 'File' },
  size: { fr: 'Taille', en: 'Size' },
  quantity: { fr: 'Quantité', en: 'Quantity' },
};
export const columnLabel = (entity: BusinessEntity, key: string, locale: Locale) =>
  entity.fields.find((f) => f.key === key)?.label[locale] ?? derivedLabels[key]?.[locale] ?? key;
export function recordTitle(record: BusinessRecord) {
  for (const key of [
    'name',
    'title',
    'number',
    'sku',
    'sourceQuoteNumber',
    'customerName',
    'memberName',
    'employeeName',
    'productName',
  ]) {
    const value = record.data[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return record.reference ?? record.id.slice(0, 8);
}
export function displayValue(
  record: BusinessRecord,
  entity: BusinessEntity,
  key: string,
  locale: Locale,
) {
  const field = entity.fields.find((f) => f.key === key),
    value = record.data[key];
  if (value === undefined || value === null || value === '')
    return key === 'number' && record.state === 'draft'
      ? locale === 'fr'
        ? 'Brouillon'
        : 'Draft'
      : '—';
  if (key.endsWith('Minor')) return formatMinor(value, locale);
  if (field?.type === 'money') {
    const text = String(value).replace(',', '.');
    if (/^\d+(?:\.\d{1,2})?$/u.test(text))
      return formatMinor(text.split('.')[0] + (text.split('.')[1] ?? '').padEnd(2, '0'), locale);
  }
  if (field?.type === 'reference') return String(record.data[key.replace(/Id$/u, 'Name')] ?? value);
  if (field?.options)
    return field.options.find((option) => option.value === value)?.label[locale] ?? String(value);
  if (field?.type === 'date' && /^\d{4}-\d{2}-\d{2}$/u.test(String(value)))
    return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { timeZone: 'UTC' }).format(
      new Date(String(value)),
    );
  if (key === 'size')
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Number(value) / 1024)} ${locale === 'fr' ? 'Kio' : 'KiB'}`;
  return String(value);
}
export const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
export function filterRecords(
  records: readonly BusinessRecord[],
  query: string,
  state: string,
  archived: boolean,
  entity?: BusinessEntity,
  locale: Locale = 'fr',
) {
  const search = normalizeSearch(query);
  return records.filter(
    (record) =>
      (archived || record.state !== 'archived') &&
      (!state || record.state === state) &&
      (!search ||
        normalizeSearch(
          [
            ...Object.values(record.data),
            record.reference ?? '',
            stateLabels[record.state]?.[locale] ?? '',
            ...(entity
              ? entity.columns.map((column) => displayValue(record, entity, column, locale))
              : []),
          ]
            .filter((v) => typeof v === 'string' || typeof v === 'number')
            .join(' '),
        ).includes(search)),
  );
}
export const canEditRecord = (record: BusinessRecord) =>
  ![
    'archived',
    'done',
    'reversed',
    'posted',
    'prepared',
    'accepted',
    'converted',
    'rejected',
    'approved',
    'paid',
  ].includes(record.state);
export interface BusinessAction {
  key: string;
  label: Label;
  description: Label;
  danger?: boolean;
}
const action = (
  key: string,
  fr: string,
  en: string,
  descriptionFr: string,
  descriptionEn: string,
  danger = false,
): BusinessAction => ({
  key,
  label: { fr, en },
  description: { fr: descriptionFr, en: descriptionEn },
  danger,
});
export function recordActions(
  record: BusinessRecord,
  canWrite: boolean,
  canApprove: boolean,
): BusinessAction[] {
  const { module, entity, state, data } = record,
    result: BusinessAction[] = [];
  if (canWrite) {
    if (module === 'sales' && entity === 'quotes') {
      if (state === 'draft')
        result.push(
          action(
            'prepare',
            'Préparer le devis',
            'Prepare quote',
            'Le devis reçoit un numéro. Ses coordonnées, lignes et montants sont ensuite figés.',
            'The quote receives a number. Its details, lines and amounts will then be locked.',
          ),
        );
      if (state === 'prepared')
        result.push(
          action(
            'accept',
            'Enregistrer l’accord',
            'Record acceptance',
            'Indiquez la référence de l’accord reçu du client.',
            'Provide a reference to the customer’s acceptance.',
          ),
          action(
            'reject',
            'Enregistrer le refus',
            'Record rejection',
            'Le devis sera marqué comme refusé.',
            'The quote will be marked as rejected.',
          ),
        );
      if (state === 'accepted')
        result.push(
          action(
            'convert',
            'Préparer la facture',
            'Prepare invoice',
            'Une préparation interne non fiscale sera créée à partir de ce devis.',
            'An internal non-fiscal invoice preparation will be created from this quote.',
          ),
        );
    }
    if (module === 'stock' && entity === 'movements' && state === 'posted' && !data.reversesId)
      result.push(
        action(
          'reverse',
          'Compenser le mouvement',
          'Reverse movement',
          'Un mouvement inverse sera enregistré. L’historique du stock est conservé.',
          'An opposite movement will be recorded. The inventory history is preserved.',
          true,
        ),
      );
    if (module === 'projects') {
      if (entity === 'tasks' && state === 'todo')
        result.push(
          action(
            'start',
            'Démarrer la tâche',
            'Start task',
            'La tâche passe en cours.',
            'The task will be marked as in progress.',
          ),
        );
      if (['active', 'todo', 'doing'].includes(state))
        result.push(
          action(
            'complete',
            'Terminer',
            'Complete',
            'Les tâches ouvertes doivent être terminées avant de clôturer leur projet.',
            'Open tasks must be completed before closing their project.',
          ),
        );
      if (state === 'done')
        result.push(
          action(
            'reopen',
            'Rouvrir',
            'Reopen',
            'Le suivi de cette fiche reprend.',
            'Tracking for this record resumes.',
          ),
        );
    }
    if (module === 'members' && entity === 'dues' && state === 'pending')
      result.push(
        action(
          'pay',
          'Enregistrer le règlement',
          'Record payment',
          'Vérifiez la date et le moyen de règlement. Le règlement enregistré ne pourra pas être réinscrit.',
          'Check the payment date and method. A recorded payment cannot be entered again.',
        ),
      );
    if (
      !['movements', 'balances', 'invoices', 'profile'].includes(entity) &&
      !['archived', 'paid'].includes(state) &&
      !(entity === 'quotes' && state !== 'draft') &&
      !(module === 'hr' && entity === 'leave' && state === 'approved')
    )
      result.push(
        action(
          'archive',
          'Archiver',
          'Archive',
          'Cette fiche sera conservée dans les archives et retirée des listes courantes.',
          'The record will be preserved in the archive and removed from current lists.',
          true,
        ),
      );
  }
  if (module === 'hr' && entity === 'leave' && state === 'requested' && canApprove)
    result.unshift(
      action(
        'approve',
        'Approuver le congé',
        'Approve leave',
        'Les dates et les chevauchements seront vérifiés avant approbation.',
        'Dates and overlaps will be checked before approval.',
      ),
      action(
        'reject',
        'Refuser le congé',
        'Reject leave',
        'La demande sera marquée comme refusée.',
        'The request will be marked as rejected.',
      ),
    );
  return result;
}
