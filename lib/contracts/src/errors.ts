export type ErrorCode =
  | 'invalid_argument'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable'
  | 'internal_error';

export interface CoreError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly correlationId?: string;
}

/** Table unifiée des erreurs HTTP publiques ; jamais de détail interne ni de secret. */
const publicErrors: Readonly<Record<number, readonly [ErrorCode, string]>> = {
  400: ['invalid_argument', 'Requête invalide.'],
  401: ['unauthenticated', 'Authentification requise.'],
  403: ['forbidden', 'Accès refusé.'],
  404: ['not_found', 'Ressource introuvable.'],
  405: ['invalid_argument', 'Méthode non autorisée.'],
  409: ['conflict', 'Conflit avec l’état actuel de la ressource.'],
  413: ['invalid_argument', 'Requête trop volumineuse.'],
  415: ['invalid_argument', 'Format de requête non pris en charge.'],
  422: ['invalid_argument', 'Requête invalide.'],
  429: ['rate_limited', 'Trop de requêtes.'],
  503: ['unavailable', 'Service temporairement indisponible.'],
};

/**
 * Mapping statut HTTP → payload d'erreur public. Fonction pure partagée par les
 * filtres Nest du Core et du BFF ; aucune dépendance NestJS ici (règle architecture).
 */
export function publicHttpError(
  status: number,
  correlationId: string,
): { readonly status: number; readonly error: CoreError; readonly logLevel: 'warn' | 'error' } {
  const [code, message] = publicErrors[status] ?? ['internal_error', 'Erreur interne du serveur.'];
  return {
    status,
    error: { code, message, correlationId },
    logLevel: status >= 500 ? 'error' : 'warn',
  };
}
