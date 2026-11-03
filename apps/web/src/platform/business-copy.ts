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
