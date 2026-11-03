import { DiagnosticsPanel } from './platform/diagnostics';
import { useSearchParams } from 'react-router';
import {
  ArrowRight,
  Check,
  CircleHelp,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Sun,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { usePreferences } from './preferences-context';
import { useBootstrap } from './bootstrap-context';
import { usePlatform } from './platform/context';
import { ModulesSection } from './platform/pages';
import { Button, AppIcon } from '@orkobi/sdk-ui';
import type { AppIconName } from '@orkobi/sdk-ui';
import type { TranslationKey } from './i18n';

interface PlannedModule {
  id: TranslationKey;
  description: TranslationKey;
  icon: AppIconName;
  audience: 'all' | 'business' | 'association';
}
const modules: readonly PlannedModule[] = [
  { id: 'contacts', description: 'contactsDescription', icon: 'contacts', audience: 'all' },
  { id: 'invoices', description: 'invoicesDescription', icon: 'invoices', audience: 'business' },
  { id: 'projects', description: 'projectsDescription', icon: 'projects', audience: 'all' },
  { id: 'stocks', description: 'stocksDescription', icon: 'stocks', audience: 'business' },
  { id: 'members', description: 'membersDescription', icon: 'members', audience: 'association' },
  { id: 'documents', description: 'documentsDescription', icon: 'documents', audience: 'all' },
];
function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function ModuleItem({ module, compact = false }: { module: PlannedModule; compact?: boolean }) {
  const { messages: t } = usePreferences();
  return (
    <li className={compact ? 'module-preview' : 'module-item'}>
      <div className={`module-icon module-${module.id}`}>
        <AppIcon name={module.icon} size={23} />
      </div>
      <div className="module-copy">
        <div className="module-name">
          <h3>{t[module.id]}</h3>
          <span className="small-label">{t.comingSoon}</span>
        </div>
        <p>{t[module.description]}</p>
      </div>
    </li>
  );
}
function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase();
}
export function ModulesPage() {
  const { messages: t } = usePreferences();
  const [params, setParams] = useSearchParams();
  const audience = ['business', 'association'].includes(params.get('audience') ?? '')
    ? params.get('audience')!
    : 'all';
  const query = params.get('q') ?? '';
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: key === 'q' });
  };
  const filtered = modules.filter(
    (module) =>
      (audience === 'all' || module.audience === 'all' || module.audience === audience) &&
      normalize(`${t[module.id]} ${t[module.description]}`).includes(normalize(query)),
  );
  return (
    <>
      <PageHeading title={t.catalogueTitle} description={t.catalogueDescription} />
      <ModulesSection />
      <div className="catalogue-tools">
        <div className="filter-group" role="group" aria-label={t.filter}>
          {(['all', 'business', 'association'] as const).map((value) => (
            <button
              key={value}
              aria-pressed={audience === value}
              onClick={() => update('audience', value)}
            >
              {t[value]}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">{t.searchModules}</span>
          <input
            type="search"
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={(event) => update('q', event.target.value)}
          />
          {query && (
            <Button variant="icon" aria-label={t.clearSearch} onClick={() => update('q', '')}>
              <X size={16} />
            </Button>
          )}
        </label>
      </div>
      <p className="result-count" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? t.plannedModule : t.plannedModules}
      </p>
      {filtered.length ? (
        <ul className="module-grid">
          {filtered.map((module) => (
            <ModuleItem key={module.id} module={module} />
          ))}
        </ul>
      ) : (
        <section className="empty-panel">
          <Search size={34} aria-hidden="true" />
          <h2>{t.noResultsTitle}</h2>
          <p>{t.noResultsText}</p>
          <Button variant="secondary" onClick={() => setParams({})}>
            {t.resetFilters}
          </Button>
        </section>
      )}
      <p className="catalogue-note">
        <CircleHelp size={17} aria-hidden="true" />
        {t.catalogueNote}
      </p>
    </>
  );
}
export function SettingsPage() {
  const { messages: t, theme, setTheme, locale, setLocale, saved } = usePreferences();
  const themes = [
    { value: 'light', label: 'light', description: 'lightDescription', icon: Sun },
    { value: 'dark', label: 'dark', description: 'darkDescription', icon: Moon },
    { value: 'system', label: 'automatic', description: 'automaticDescription', icon: Monitor },
  ] as const;
  return (
    <>
      <PageHeading title={t.settingsTitle} description={t.settingsDescription} />
      <section className="settings-panel">
        <fieldset>
          <legend>{t.appearance}</legend>
          <p className="field-description">{t.appearanceDescription}</p>
          <div className="theme-options">
            {themes.map(({ value, label, description, icon: Icon }) => (
              <label className={`theme-option ${theme === value ? 'is-selected' : ''}`} key={value}>
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={theme === value}
                  onChange={() => setTheme(value)}
                />
                <Icon size={23} aria-hidden="true" />
                <strong>{t[label]}</strong>
                <small>{t[description]}</small>
                {theme === value && (
                  <Check size={16} className="selection-check" aria-hidden="true" />
                )}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="language-setting">
          <div>
            <label htmlFor="preferred-language">{t.language}</label>
            <p>{t.languageDescription}</p>
          </div>
          <select
            id="preferred-language"
            value={locale}
            onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'fr')}
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </div>
        <p className={`save-status ${saved ? '' : 'save-warning'}`} role="status">
          {saved ? <Check size={16} /> : <CircleHelp size={16} />}
          <span>{saved ? t.preferenceSaved : t.preferenceNotSaved}</span>
        </p>
      </section>
    </>
  );
}
export function StatusPage() {
  const platform = usePlatform();
  const { messages: t, locale } = usePreferences();
  const { data, loading, error, refresh } = useBootstrap();
  const state = (available: boolean) => (
    <span
      className={`service-state ${loading ? 'checking' : available ? 'available' : 'unavailable'}`}
    >
      <span className="status-dot" />
      {loading ? t.pending : available ? t.operational : t.unavailable}
    </span>
  );
  return (
    <>
      <PageHeading
        title={t.systemTitle}
        description={t.systemDescription}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              refresh();
              void platform.refresh();
            }}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'is-refreshing' : ''} />
            {loading ? t.refreshing : t.refresh}
          </Button>
        }
      />
      <section className="service-panel" aria-busy={loading}>
        <div className="service-table-heading">
          <span>{t.service}</span>
          <span>{t.state}</span>
        </div>
        <div className="service-row">
          <div>
            <h2>{t.bffName}</h2>
            <p>{t.bffDescription}</p>
          </div>
          {state(!error && data !== null)}
        </div>
        <div className="service-row">
          <div>
            <h2>{t.coreName}</h2>
            <p>{t.coreDescription}</p>
          </div>
          {state(!error && data?.core.status === 'ok')}
        </div>
        <div className="service-row">
          <div>
            <h2>{t.databaseName}</h2>
            <p>{t.databaseDescription}</p>
          </div>
          {state(platform.status?.databaseReady === true)}
        </div>
        <div className="service-row">
          <div>
            <h2>{t.modulesServiceName}</h2>
            <p>{t.modulesServiceDescription}</p>
          </div>
          {state(platform.status?.modulesReady === true)}
        </div>
        <div className="checked-at">
          {loading
            ? t.refreshing
            : data
              ? `${t.checkedAt} : ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(data.checkedAt))}`
              : t.connectionRecovery}
        </div>
      </section>
      {platform.session.user?.platformAdmin && <DiagnosticsPanel />}
      <div className="plain-note">
        <h2>{t.preparation}</h2>
        <p>{t.serviceNote}</p>
      </div>
    </>
  );
}
export function NotFoundPage() {
  const { messages: t } = usePreferences();
  return (
    <section className="not-found">
      <span className="not-found-number">404</span>
      <h1>{t.notFoundTitle}</h1>
      <p>{t.notFoundText}</p>
      <Button variant="primary" to="/">
        {t.home}
        <ArrowRight size={16} />
      </Button>
    </section>
  );
}
