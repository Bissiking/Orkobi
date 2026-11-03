import type { PluginHandler } from '@orkobi/sdk-core';

/** Plugin externe : compilé séparément, jamais importé par le Core. */
export const add_card: PluginHandler = (sdk, input) => {
  const title = typeof input.title === 'string' ? input.title : '';
  return sdk.data.create('cards', { title, content: 'Créée par le moteur isolé.' });
};
export const count_cards: PluginHandler = (sdk) => {
  const result = sdk.data.list('cards');
  return result.ok ? { count: result.value.entries.length } : result;
};
export const verify_cards: PluginHandler = (sdk) => {
  const result = sdk.data.list('cards');
  if (!result.ok) throw new Error('Lecture refusée.');
  return { count: result.value.entries.length };
};
