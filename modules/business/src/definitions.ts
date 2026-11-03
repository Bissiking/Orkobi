import type {
  BusinessDefinition,
  BusinessEntity,
  BusinessField,
  BusinessLabel,
  BusinessModuleKey,
  ModuleManifest,
  PermissionKey,
} from '@orkobi/sdk-types';
const label = (fr: string, en: string): BusinessLabel => ({ fr, en });
const field = (
  key: string,
  fr: string,
  en: string,
  type: BusinessField['type'] = 'text',
  required = false,
  extra: Partial<BusinessField> = {},
): BusinessField => ({ key, label: label(fr, en), type, required, max: 160, ...extra });
const options = (...values: string[]) =>
  values.map((value) => {
    const [key, fr, en] = value.split('|');
    return { value: key!, label: label(fr!, en!) };
  });
const ref = (
  key: string,
  fr: string,
  en: string,
  module: BusinessModuleKey,
  entity: string,
  required = true,
) => field(key, fr, en, 'reference', required, { reference: { module, entity } });
const entity = (
  key: string,
  fr: string,
  en: string,
  fields: BusinessField[],
  columns: string[],
  readOnly = false,
): BusinessEntity => ({ key, label: label(fr, en), fields, columns, readOnly });
const definitions: {
  key: BusinessModuleKey;
  fr: string;
  en: string;
  description: string;
  icon: BusinessDefinition['icon'];
  dependencies: BusinessModuleKey[];
  entities: BusinessEntity[];
  extraPermissions?: string[];
}[] = [
  {
    key: 'crm',
    fr: 'Clients et contacts',
    en: 'Customers and contacts',
    description: 'Clients, prospects et coordonnées par organisation.',
    icon: 'contacts',
    dependencies: [],
    entities: [
      entity(
        'contacts',
        'Clients et contacts',
        'Customers and contacts',
        [
          field('name', 'Nom / raison sociale', 'Name / legal name', 'text', true),
          field('kind', 'Type', 'Type', 'select', true, {
            options: options('company|Entreprise|Business', 'person|Particulier|Individual'),
          }),
          field('stage', 'Relation', 'Relationship', 'select', true, {
            options: options('prospect|Prospect|Prospect', 'customer|Client|Customer'),
          }),
          field('email', 'E-mail', 'Email', 'email'),
          field('phone', 'Téléphone', 'Phone'),
          field('address', 'Adresse', 'Address', 'textarea'),
          field('postalCode', 'Code postal', 'Postal code'),
          field('city', 'Ville', 'City'),
          field('country', 'Pays (code ISO)', 'Country (ISO code)', 'text', true, { max: 2 }),
          field('siren', 'SIREN', 'SIREN', 'text', false, { max: 9 }),
          field('vatNumber', 'Numéro de TVA', 'VAT number'),
          field('notes', 'Notes', 'Notes', 'textarea', false, { max: 2000 }),
        ],
        ['name', 'kind', 'stage', 'email'],
      ),
    ],
  },
  {
    key: 'products',
    fr: 'Produits et services',
    en: 'Products and services',
    description: 'Références, prix EUR et taux de TVA déclarés.',
    icon: 'stocks',
    dependencies: [],
    entities: [
      entity(
        'products',
        'Produits et services',
        'Products and services',
        [
          field('sku', 'Référence', 'SKU', 'text', true, { max: 60 }),
          field('name', 'Désignation', 'Name', 'text', true),
          field('kind', 'Nature', 'Type', 'select', true, {
            options: options('goods|Bien|Goods', 'service|Service|Service'),
          }),
          field('price', 'Prix unitaire HT (EUR)', 'Unit price excl. VAT (EUR)', 'money', true),
          field('vatRate', 'TVA (%)', 'VAT (%)', 'select', true, {
            options: options(
              '20|20 %|20%',
              '10|10 %|10%',
              '5.5|5,5 %|5.5%',
              '2.1|2,1 %|2.1%',
              '0|0 %|0%',
            ),
          }),
          field('exemption', 'Motif du taux nul', 'Zero-rate reason'),
          field('unit', 'Unité', 'Unit', 'text', true, { max: 40 }),
        ],
        ['sku', 'name', 'kind', 'price', 'vatRate'],
      ),
    ],
  },
  {
    key: 'sales',
    fr: 'Devis et préparations de factures',
    en: 'Quotes and invoice preparations',
    description:
      'Devis chiffrés et préparations internes ; émission fiscale bloquée sans plateforme agréée.',
    icon: 'invoices',
    dependencies: ['crm', 'products'],
    entities: [
      entity(
        'profile',
        'Identité commerciale',
        'Business identity',
        [
          field('name', 'Raison sociale', 'Legal name', 'text', true),
          field('address', 'Adresse complète', 'Full address', 'textarea', true),
          field('siren', 'SIREN', 'SIREN', 'text', true, { max: 9 }),
          field('vatNumber', 'Numéro de TVA / régime', 'VAT number / regime', 'text', true),
          field(
            'legalTerms',
            'Conditions et mentions applicables',
            'Applicable terms and notices',
            'textarea',
            true,
            { max: 4000 },
          ),
        ],
        ['name', 'siren'],
      ),
      entity(
        'quotes',
        'Devis',
        'Quotes',
        [
          ref('customerId', 'Client', 'Customer', 'crm', 'contacts'),
          field('validUntil', 'Valable jusqu’au', 'Valid until', 'date', true),
          field('notes', 'Conditions complémentaires', 'Additional terms', 'textarea', false, {
            max: 2000,
          }),
        ],
        ['customerName', 'validUntil', 'totalMinor'],
      ),
      entity(
        'invoices',
        'Préparations de factures',
        'Invoice preparations',
        [],
        ['customerName', 'sourceQuoteNumber', 'totalMinor'],
        true,
      ),
    ],
  },
  {
    key: 'stock',
    fr: 'Gestion des stocks',
    en: 'Inventory',
    description: 'Entrepôts, mouvements tracés et soldes sans stock négatif.',
    icon: 'stocks',
    dependencies: ['products'],
    entities: [
      entity(
        'warehouses',
        'Entrepôts',
        'Warehouses',
        [
          field('code', 'Code', 'Code', 'text', true, { max: 40 }),
          field('name', 'Nom', 'Name', 'text', true),
        ],
        ['code', 'name'],
      ),
      entity(
        'movements',
        'Mouvements',
        'Movements',
        [
          ref('productId', 'Produit', 'Product', 'products', 'products'),
          ref('warehouseId', 'Entrepôt', 'Warehouse', 'stock', 'warehouses'),
          field('direction', 'Sens', 'Direction', 'select', true, {
            options: options('in|Entrée|Receipt', 'out|Sortie|Issue'),
          }),
          field('quantity', 'Quantité', 'Quantity', 'quantity', true),
          field('reason', 'Motif', 'Reason', 'text', true),
        ],
        ['productName', 'warehouseName', 'direction', 'quantity'],
      ),
      entity(
        'balances',
        'Soldes',
        'Balances',
        [],
        ['productName', 'warehouseName', 'quantity'],
        true,
      ),
    ],
  },
  {
    key: 'projects',
    fr: 'Projets et tâches',
    en: 'Projects and tasks',
    description: 'Projets, échéances, tâches et contrôle de clôture.',
    icon: 'projects',
    dependencies: [],
    entities: [
      entity(
        'projects',
        'Projets',
        'Projects',
        [
          field('code', 'Code', 'Code', 'text', true, { max: 40 }),
          field('name', 'Nom', 'Name', 'text', true),
          field('description', 'Description', 'Description', 'textarea', false, { max: 2000 }),
          field('startDate', 'Début', 'Start', 'date', true),
          field('endDate', 'Fin prévue', 'Target end', 'date', true),
          field('budget', 'Budget EUR', 'Budget EUR', 'money'),
        ],
        ['code', 'name', 'endDate', 'budget'],
      ),
      entity(
        'tasks',
        'Tâches',
        'Tasks',
        [
          ref('projectId', 'Projet', 'Project', 'projects', 'projects'),
          field('title', 'Titre', 'Title', 'text', true),
          field('assignee', 'Responsable (nom)', 'Assignee (name)'),
          field('dueDate', 'Échéance', 'Due date', 'date', true),
        ],
        ['title', 'projectName', 'assignee', 'dueDate'],
      ),
    ],
  },
  {
    key: 'members',
    fr: 'Membres et cotisations',
    en: 'Members and dues',
    description: 'Membres, périodes de cotisation et règlements administratifs.',
    icon: 'members',
    dependencies: [],
    entities: [
      entity(
        'members',
        'Membres',
        'Members',
        [
          field('number', 'Numéro de membre', 'Member number', 'text', true, { max: 40 }),
          field('name', 'Nom', 'Name', 'text', true),
          field('email', 'E-mail', 'Email', 'email'),
          field('joinedOn', 'Adhésion le', 'Joined on', 'date', true),
        ],
        ['number', 'name', 'email', 'joinedOn'],
      ),
      entity(
        'dues',
        'Cotisations',
        'Dues',
        [
          ref('memberId', 'Membre', 'Member', 'members', 'members'),
          field('period', 'Période', 'Period', 'text', true, { max: 40 }),
          field('amount', 'Montant EUR', 'Amount EUR', 'money', true),
          field('dueDate', 'Échéance', 'Due date', 'date', true),
        ],
        ['memberName', 'period', 'amount', 'dueDate'],
      ),
    ],
  },
  {
    key: 'documents',
    fr: 'Documents',
    en: 'Documents',
    description: 'Pièces jointes limitées à 48 Kio, empreinte et téléchargement autorisé.',
    icon: 'documents',
    dependencies: [],
    entities: [
      entity(
        'files',
        'Documents',
        'Documents',
        [
          field('name', 'Titre', 'Title', 'text', true),
          field('file', 'Fichier (48 Kio max.)', 'File (48 KiB max.)', 'file', true),
        ],
        ['name', 'fileName', 'size'],
      ),
    ],
  },
  {
    key: 'reports',
    fr: 'Rapports et statistiques',
    en: 'Reports and statistics',
    description: 'Agrégats réels limités aux modules que vous pouvez consulter.',
    icon: 'projects',
    dependencies: [],
    entities: [],
  },
  {
    key: 'hr',
    fr: 'Ressources humaines',
    en: 'Human resources',
    description:
      'Annuaire des salariés et demandes d’absence ; hors paie et déclarations sociales.',
    icon: 'contacts',
    dependencies: [],
    extraPermissions: ['approve'],
    entities: [
      entity(
        'employees',
        'Salariés',
        'Employees',
        [
          field('number', 'Matricule', 'Employee number', 'text', true, { max: 40 }),
          field('name', 'Nom', 'Name', 'text', true),
          field('email', 'E-mail professionnel', 'Work email', 'email'),
          field('jobTitle', 'Fonction', 'Job title'),
          field('contract', 'Contrat', 'Contract', 'select', true, {
            options: options(
              'permanent|CDI|Permanent',
              'fixed|CDD|Fixed-term',
              'intern|Stage|Internship',
            ),
          }),
          field('startDate', 'Début du contrat', 'Contract start', 'date', true),
          field('endDate', 'Fin du contrat', 'Contract end', 'date'),
        ],
        ['number', 'name', 'jobTitle', 'contract'],
      ),
      entity(
        'leave',
        'Demandes d’absence',
        'Leave requests',
        [
          ref('employeeId', 'Salarié', 'Employee', 'hr', 'employees'),
          field('startDate', 'Du', 'From', 'date', true),
          field('endDate', 'Au', 'To', 'date', true),
          field('category', 'Catégorie', 'Category', 'select', true, {
            options: options(
              'paid|Congés payés|Paid leave',
              'unpaid|Sans solde|Unpaid',
              'other|Autre absence administrative|Other administrative leave',
            ),
          }),
        ],
        ['employeeName', 'startDate', 'endDate', 'category'],
      ),
    ],
  },
];
export const businessDefinitions: readonly BusinessDefinition[] = Object.freeze(
  definitions.map((d) => {
    const permissions = [
      'read',
      ...(d.key === 'reports' ? [] : ['write']),
      ...(d.extraPermissions ?? []),
    ].map((action) => ({
      key: `orkobi.${d.key}:${action}` as PermissionKey,
      description: `${d.fr} : ${action}.`,
    }));
    const manifest: ModuleManifest = {
      id: `orkobi.${d.key}`,
      version: '0.1.0',
      name: d.fr,
      description: d.description,
      core: '>=0.2.0-EXP <0.3.0',
      dependencies: d.dependencies.map((key) => `orkobi.${key}`),
      capabilities: [
        { key: 'core.identity', required: true },
        { key: 'core.permissions', required: true },
        { key: 'core.modules', required: true },
        { key: 'core.audit', required: true },
      ],
      permissions,
      entities: [],
    };
    return Object.freeze({
      key: d.key,
      label: label(d.fr, d.en),
      icon: d.icon,
      manifest,
      entities: d.entities,
    });
  }),
);
export const businessDefinition = (key: string) =>
  businessDefinitions.find((definition) => definition.key === key);
