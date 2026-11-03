import { readFileSync, statSync } from 'node:fs';
import { loadRepositories } from '@orkobi/store';
import type { StoreRepositoryConfig } from '@orkobi/store';
export const STORE_CONFIG = Symbol('STORE_CONFIG');
export function loadStoreConfig(
  env: Record<string, string | undefined>,
): readonly StoreRepositoryConfig[] {
  try {
    if (env.STORE_REPOSITORIES_JSON && env.STORE_REPOSITORIES_FILE) throw new Error();
    let text = env.STORE_REPOSITORIES_JSON;
    if (env.STORE_REPOSITORIES_FILE) {
      if (statSync(env.STORE_REPOSITORIES_FILE).size > 32768) throw new Error();
      text = readFileSync(env.STORE_REPOSITORIES_FILE, 'utf8');
    }
    if (text && text.length > 32768) throw new Error();
    return loadRepositories(text);
  } catch {
    throw new Error('Configuration des dépôts Store invalide.');
  }
}
