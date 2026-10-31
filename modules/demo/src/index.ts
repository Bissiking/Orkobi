import type { ModuleManifest } from '@orkobi/contracts';

/** Premier module officiel : démonstration du cycle manifeste → activation → données. */
export const demoManifest: ModuleManifest = Object.freeze({
  id: 'orkobi.demo',
  version: '0.1.0',
  name: 'Notes de démonstration',
  description: 'Module de démonstration de la Phase 2 : notes partagées, isolées par organisation.',
  core: '>=0.2.0-EXP <0.3.0',
  dependencies: Object.freeze([]),
  capabilities: Object.freeze([
    Object.freeze({ key: 'core.identity', required: true }),
    Object.freeze({ key: 'core.permissions', required: true }),
    Object.freeze({ key: 'core.modules', required: true }),
    Object.freeze({ key: 'core.data.sql', required: true }),
    Object.freeze({ key: 'core.audit', required: false }),
  ]),
  permissions: Object.freeze([
    Object.freeze({ key: 'demo:read', description: 'Consulter les notes de démonstration.' }),
    Object.freeze({
      key: 'demo:write',
      description: 'Créer, modifier et supprimer les notes de démonstration.',
    }),
  ]),
  entities: Object.freeze([
    Object.freeze({
      entity: 'notes',
      table: 'orkobi_demo.notes',
      read: 'demo:read',
      write: 'demo:write',
      fields: Object.freeze([
        Object.freeze({ name: 'title', type: 'text', required: true, max: 120 }),
        Object.freeze({ name: 'content', type: 'text', required: false, max: 4000 }),
      ]),
    }),
  ]),
});

export const demoModuleId = 'orkobi.demo';
