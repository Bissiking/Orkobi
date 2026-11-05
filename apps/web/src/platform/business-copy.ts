import type { BusinessProblem } from '@orkobi/contracts';
export const businessProblems: Record<BusinessProblem, { fr: string; en: string }> = {
  invalid_fields: {
    fr: 'Les champs envoyés ne correspondent pas à ce formulaire.',
    en: 'The submitted fields do not match this form.',
  },
  invalid_value: { fr: 'Vérifiez les valeurs saisies.', en: 'Check the entered values.' },
  invalid_reference: {
    fr: 'La référence est absente, archivée ou inaccessible.',
    en: 'The reference is missing, archived or inaccessible.',
  },
  duplicate_reference: {
    fr: 'Cette référence existe déjà, y compris dans les archives.',
    en: 'This reference already exists, including in archived records.',
  },
  revision_conflict: {
    fr: 'Une autre modification a eu lieu. Rechargez la fiche avant de réessayer.',
    en: 'The record changed. Reload it before retrying.',
  },
  invalid_transition: {
    fr: 'Cette opération ne correspond pas à l’état actuel de la fiche.',
    en: 'This operation is not allowed in the current state.',
  },
  insufficient_stock: {
    fr: 'Stock disponible insuffisant pour ce mouvement.',
    en: 'Insufficient available stock for this movement.',
  },
  already_reversed: {
    fr: 'Ce mouvement a déjà été compensé ou est lui-même une compensation.',
    en: 'This movement has already been reversed or is a reversal.',
  },
  project_has_open_tasks: {
    fr: 'Terminez ou archivez les tâches ouvertes du projet.',
    en: 'Complete or archive the open project tasks.',
  },
  invalid_dates: {
    fr: 'Les dates sont incohérentes, se chevauchent ou dépassent le contrat.',
    en: 'Dates are inconsistent, overlap or fall outside the contract.',
  },
  billing_provider_required: {
    fr: 'L’émission fiscale nécessite une plateforme agréée. Cette fiche reste une préparation interne.',
    en: 'Fiscal issuance requires an approved platform. This record remains an internal preparation.',
  },
  quote_expired: {
    fr: 'La date de validité du devis est dépassée.',
    en: 'The quote validity date has passed.',
  },
  file_invalid: {
    fr: 'Fichier invalide : PDF, PNG, JPEG ou texte UTF-8 uniquement.',
    en: 'Invalid file: PDF, PNG, JPEG or UTF-8 text only.',
  },
  file_too_large: {
    fr: 'Le fichier doit contenir entre 1 octet et 48 Kio.',
    en: 'The file must contain between 1 byte and 48 KiB.',
  },
  record_limit: {
    fr: 'La limite de ce stockage ou de cette relation est atteinte.',
    en: 'The storage or relation limit has been reached.',
  },
  idempotency_conflict: {
    fr: 'Cette clé de requête a déjà servi pour une autre opération.',
    en: 'This request key was already used for another operation.',
  },
  profile_required: {
    fr: 'Complétez l’identité commerciale avant de préparer un devis.',
    en: 'Complete the business identity before preparing a quote.',
  },
};
export const stateLabels: Record<string, { fr: string; en: string }> = {
  active: { fr: 'Active', en: 'Active' },
  archived: { fr: 'Archivée', en: 'Archived' },
  draft: { fr: 'Brouillon', en: 'Draft' },
  prepared: { fr: 'Préparée', en: 'Prepared' },
  accepted: { fr: 'Accepté', en: 'Accepted' },
  rejected: { fr: 'Refusée', en: 'Rejected' },
  converted: { fr: 'Converti', en: 'Converted' },
  posted: { fr: 'Comptabilisé', en: 'Posted' },
  reversed: { fr: 'Compensé', en: 'Reversed' },
  todo: { fr: 'À faire', en: 'To do' },
  doing: { fr: 'En cours', en: 'In progress' },
  done: { fr: 'Terminé', en: 'Done' },
  pending: { fr: 'À régler', en: 'Pending' },
  paid: { fr: 'Réglée', en: 'Paid' },
  requested: { fr: 'Demandée', en: 'Requested' },
  approved: { fr: 'Approuvée', en: 'Approved' },
};
export function formatMinor(value: unknown, locale: 'fr' | 'en') {
  try {
    const amount = BigInt(String(value)),
      negative = amount < 0n,
      abs = negative ? -amount : amount;
    return `${negative ? '-' : ''}${(abs / 100n).toLocaleString(locale)}${locale === 'fr' ? ',' : '.'}${String(abs % 100n).padStart(2, '0')} €`;
  } catch {
    return '—';
  }
}

/** Libellés des parcours métier ; les déclarations de champs restent fournies par le Core. */
export const businessUi = {
  close: { fr: 'Fermer', en: 'Close' },
  confirm: { fr: 'Confirmer', en: 'Confirm' },
  cancel: { fr: 'Annuler', en: 'Cancel' },
  evidenceReferenceOfAcceptance: {
    fr: 'Preuve / référence de l’accord reçu',
    en: 'Evidence / reference of acceptance',
  },
  reversalReason: { fr: 'Motif de la compensation', en: 'Reversal reason' },
  paidOn: { fr: 'Réglée le', en: 'Paid on' },
  paymentMethod: { fr: 'Moyen de règlement', en: 'Payment method' },
  transfer: { fr: 'Virement', en: 'Transfer' },
  cash: { fr: 'Espèces', en: 'Cash' },
  check: { fr: 'Chèque', en: 'Check' },
  other: { fr: 'Autre', en: 'Other' },
  paymentReference: { fr: 'Référence du règlement', en: 'Payment reference' },
  refreshRecord: { fr: 'Actualiser la fiche', en: 'Refresh record' },
  edit: { fr: 'Modifier', en: 'Edit' },
  print: { fr: 'Imprimer', en: 'Print' },
  file: { fr: 'Fichier', en: 'File' },
  size: { fr: 'Taille', en: 'Size' },
  format: { fr: 'Format', en: 'Format' },
  downloading: { fr: 'Téléchargement…', en: 'Downloading…' },
  downloadDocument: { fr: 'Télécharger le document', en: 'Download document' },
  downloadUnavailable: {
    fr: 'Téléchargement indisponible. Réessayez ou vérifiez vos droits.',
    en: 'Download unavailable. Retry or check your permissions.',
  },
  recordInformation: { fr: 'Informations de la fiche', en: 'Record information' },
  id: { fr: 'Identifiant', en: 'ID' },
  revision: { fr: 'Révision', en: 'Revision' },
  invoicePreparationNonFiscalDocument: {
    fr: 'Préparation de facture — document non fiscal',
    en: 'Invoice preparation — non-fiscal document',
  },
  quote: { fr: 'Devis', en: 'Quote' },
  draft: { fr: '· Brouillon', en: '· Draft' },
  preparedOn: { fr: 'Préparé le', en: 'Prepared on' },
  validUntil: { fr: 'Valable jusqu’au', en: 'Valid until' },
  notIssuedNoFiscalTransmission: {
    fr: 'Non émise · aucune transmission fiscale',
    en: 'Not issued · no fiscal transmission',
  },
  seller: { fr: 'Émetteur', en: 'Seller' },
  customer: { fr: 'Client', en: 'Customer' },
  documentLines: { fr: 'Lignes du document', en: 'Document lines' },
  item: { fr: 'Désignation', en: 'Item' },
  quantity: { fr: 'Quantité', en: 'Quantity' },
  priceExclVAT: { fr: 'Prix HT', en: 'Price excl. VAT' },
  vat: { fr: 'TVA', en: 'VAT' },
  total: { fr: 'TTC', en: 'Total' },
  exclVAT: { fr: 'HT', en: 'Excl. VAT' },
  inclVAT: { fr: 'TTC', en: 'Incl. VAT' },
  operationFailed: {
    fr: 'L’opération n’a pas abouti. Vérifiez votre connexion et réessayez avec ce formulaire.',
    en: 'The operation did not complete. Check your connection and retry with this form.',
  },
  reloadRecord: { fr: 'Recharger la fiche', en: 'Reload record' },
  recordsHelp: {
    fr: 'Retrouvez vos fiches et poursuivez votre travail.',
    en: 'Find your records and continue your work.',
  },
  refreshList: { fr: 'Actualiser la liste', en: 'Refresh list' },
  editBusinessIdentity: { fr: 'Modifier l’identité', en: 'Edit business identity' },
  addRecord: { fr: 'Ajouter une fiche', en: 'Add record' },
  filterThisPage: { fr: 'Filtrer cette page', en: 'Filter this page' },
  searchThisPage: { fr: 'Rechercher dans cette page…', en: 'Search this page…' },
  clearSearch: { fr: 'Effacer la recherche', en: 'Clear search' },
  statusOnThisPage: { fr: 'État sur cette page', en: 'Status on this page' },
  allStatuses: { fr: 'Tous les états', en: 'All statuses' },
  archived: { fr: 'Archives', en: 'Archived' },
  noMatchesOnThisPage: {
    fr: 'Aucune correspondance sur cette page',
    en: 'No matches on this page',
  },
  startWithYourFirstRecord: {
    fr: 'Votre première fiche commence ici',
    en: 'Start with your first record',
  },
  emptyFilterHelp: {
    fr: 'Essayez un autre terme, changez les filtres ou consultez la page suivante.',
    en: 'Try another term, change the filters or view the next page.',
  },
  firstRecordHelp: {
    fr: 'Ajoutez une fiche pour commencer à utiliser ce module dans votre organisation.',
    en: 'Add a record to start using this module in your organization.',
  },
  clearFilters: { fr: 'Effacer les filtres', en: 'Clear filters' },
  status: { fr: 'État', en: 'Status' },
  open: { fr: 'Ouvrir', en: 'Open' },
  pageRecordCount: {
    fr: 'fiche(s) affichée(s) sur cette page',
    en: 'record(s) shown on this page',
  },
  upTo100PerPage: { fr: '100 maximum par page.', en: 'Up to 100 per page.' },
  firstPage: { fr: 'Première page', en: 'First page' },
  previous: { fr: 'Précédent', en: 'Previous' },
  next: { fr: 'Suivant', en: 'Next' },
  switchModule: { fr: 'Changer de module', en: 'Switch module' },
  record: { fr: 'Fiche', en: 'Record' },
  editRecord: { fr: 'Modifier la fiche', en: 'Edit record' },
  newRecord: { fr: 'Nouvelle fiche', en: 'New record' },
  fieldsMarkedAreRequired: {
    fr: 'Les champs marqués * sont obligatoires.',
    en: 'Fields marked * are required.',
  },
  unsavedChanges: { fr: 'Modifications non enregistrées', en: 'Unsaved changes' },
  save: { fr: 'Enregistrer', en: 'Save' },
  reloadAndDiscardChangesInThisForm: {
    fr: 'Recharger et abandonner les modifications de ce formulaire ?',
    en: 'Reload and discard changes in this form?',
  },
  additionalDetails: { fr: 'Informations complémentaires', en: 'Additional details' },
  fileRequired: { fr: 'Fichier *', en: 'File *' },
  fileUploadHelp: {
    fr: 'PDF, PNG, JPEG ou texte UTF-8 · 48 Kio maximum.',
    en: 'PDF, PNG, JPEG or UTF-8 text · Up to 48 KiB.',
  },
  readingFile: { fr: 'Lecture du fichier…', en: 'Reading file…' },
  organizationReport: { fr: 'Rapport de l’organisation', en: 'Organization report' },
  reportScopeHelp: {
    fr: 'Toutes les fiches des modules actifs que vous pouvez consulter.',
    en: 'All records from active modules you may read.',
  },
  refresh: { fr: 'Actualiser', en: 'Refresh' },
  reportAmountsNotice: {
    fr: 'Les montants des devis et préparations de factures ne constituent pas un chiffre d’affaires facturé.',
    en: 'Quote and invoice preparation amounts are not invoiced revenue.',
  },
  noRecordsInThisModule: { fr: 'Aucune fiche dans ce module.', en: 'No records in this module.' },
  recordCount: { fr: 'fiche(s)', en: 'record(s)' },
  reportEmpty: {
    fr: 'Aucun autre module actif et autorisé ne contient de données à présenter.',
    en: 'No other active and authorized modules are available to report.',
  },
  updatedOn: { fr: 'Actualisé le', en: 'Updated on' },
  enGB: { fr: 'fr-FR', en: 'en-GB' },
  changesSaved: { fr: 'Modifications enregistrées.', en: 'Changes saved.' },
  moduleNotFound: { fr: 'Ce module est introuvable.', en: 'Module not found.' },
  backToModules: { fr: 'Revenir aux modules', en: 'Back to modules' },
  chooseOrganization: {
    fr: 'Choisissez une organisation dans la barre supérieure pour ouvrir ce module.',
    en: 'Choose an organization in the top bar to open this module.',
  },
  readPermissionRequired: {
    fr: 'Vous n’avez pas accès aux données de ce module. Un administrateur doit vous accorder le droit de consultation.',
    en: 'You do not have access to this module’s data. An administrator must grant read permission.',
  },
  viewOrganizationModules: {
    fr: 'Voir les modules de l’organisation',
    en: 'View organization modules',
  },
  moduleInactive: {
    fr: 'Ce module n’est pas actif dans cette organisation.',
    en: 'This module is not active in this organization.',
  },
  manageModules: { fr: 'Gérer les modules', en: 'Manage modules' },
  nonFiscalNotice: {
    fr: 'Les factures sont des préparations internes non fiscales. L’émission et la transmission restent bloquées sans plateforme agréée.',
    en: 'Invoices are internal non-fiscal preparations. Issuance and transmission remain blocked without an approved platform.',
  },
  hrScopeNotice: {
    fr: 'Suivi administratif : hors paie, données médicales et déclarations sociales.',
    en: 'Administrative tracking: excludes payroll, health data and statutory reporting.',
  },
  dismissMessage: { fr: 'Fermer le message', en: 'Dismiss message' },
  listNotFound: { fr: 'Cette liste est introuvable.', en: 'List not found.' },
  createNotAllowed: {
    fr: 'Vous ne pouvez pas créer de fiche dans cette liste.',
    en: 'You cannot create a record in this list.',
  },
  loading: { fr: 'Chargement…', en: 'Loading…' },
  select: { fr: 'Sélectionner', en: 'Select' },
  loadMoreReferences: { fr: 'Charger d’autres références', en: 'Load more references' },
  referencesUnavailable: {
    fr: 'Références indisponibles. Vérifiez les modules actifs et vos droits.',
    en: 'References unavailable. Check active modules and your permissions.',
  },
  retry: { fr: 'Réessayer', en: 'Retry' },
  unit: { fr: 'unité', en: 'unit' },
  decimalPlaceholder: { fr: '0,00', en: '0.00' },
  requiredForAZeroVATRate: {
    fr: 'À renseigner pour un taux de TVA nul.',
    en: 'Required for a zero VAT rate.',
  },
  quoteLines: { fr: 'Lignes du devis', en: 'Quote lines' },
  quantityRequired: { fr: 'Quantité *', en: 'Quantity *' },
  priceExclVATEUR: { fr: 'Prix HT (EUR)', en: 'Price excl. VAT (EUR)' },
  catalogPrice: { fr: 'Prix catalogue', en: 'Catalog price' },
  blankCatalogPrice: { fr: 'Vide : prix du catalogue', en: 'Blank: catalog price' },
  removeLine: { fr: 'Retirer la ligne', en: 'Remove line' },
  addLine: { fr: 'Ajouter une ligne', en: 'Add line' },
  totalInclVAT: { fr: 'Total TTC', en: 'Total incl. VAT' },
  estimateNotice: {
    fr: 'Estimation ; le serveur vérifie les montants à l’enregistrement.',
    en: 'Estimate; amounts are verified by the server on save.',
  },
  estimateIncomplete: {
    fr: 'Complétez les lignes pour estimer le total.',
    en: 'Complete the lines to estimate the total.',
  },
} as const;
