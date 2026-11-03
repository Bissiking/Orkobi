import { readFileSync } from 'node:fs';
/** Source produit unique, commune à OpenAPI et au contrôle de compatibilité. */
export const coreVersion: string = (
  JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
