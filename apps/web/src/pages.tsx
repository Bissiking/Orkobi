import { Link, useSearchParams } from 'react-router';
import {
  ArrowRight,
  Building2,
  Check,
  CircleHelp,
  FileText,
  FolderKanban,
  Handshake,
  Layers3,
  Monitor,
  Moon,
  Package,
  RefreshCw,
  Search,
  Settings2,
  Sun,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePreferences } from './preferences-context';
import { useBootstrap } from './bootstrap-context';
import { usePlatform } from './platform/context';
import type { TranslationKey } from './i18n';

interface PlannedModule {
  id: TranslationKey;
  description: TranslationKey;
  icon: LucideIcon;
  audience: 'all' | 'business' | 'association';
}
const modules: readonly PlannedModule[] = [
  { id: 'contacts', description: 'contactsDescription', icon: Users, audience: 'all' },
  { id: 'invoices', description: 'invoicesDescription', icon: FileText, audience: 'business' },
  { id: 'projects', description: 'projectsDescription', icon: FolderKanban, audience: 'all' },
  { id: 'stocks', description: 'stocksDescription', icon: Package, audience: 'business' },
  { id: 'members', description: 'membersDescription', icon: Handshake, audience: 'association' },
  { id: 'documents', description: 'documentsDescription', icon: Layers3, audience: 'all' },
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
  const Icon = module.icon;
  return (
    <li className={compact ? 'module-preview' : 'module-item'}>
      <div className={`module-icon module-${module.id}`}>
        <Icon size={23} aria-hidden="true" />
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
export function HomePage() {
  const { messages: t } = usePreferences();
  return (
    <>
      <PageHeading
        title={t.welcomeTitle}
        description={t.welcomeDescription}
        action={
          <Link className="button primary" to="/modules">
            {t.explore}
            <ArrowRight size={17} />
          </Link>
        }
      />
      <div className="welcome-layout">
        <section className="organization-panel" aria-labelledby="your-organization">
          <div className="panel-heading">
            <h2 id="your-organization">{t.yourOrganization}</h2>
            <span className="small-label">{t.preparation}</span>
          </div>
          <div className="organization-intro">
            <Building2
              className="organization-glyph"
              size={40}
              strokeWidth={1.35}
              aria-hidden="true"
            />
            <h2>{t.organizationTitle}</h2>
            <p>{t.organizationDescription}</p>
            <Link className="button secondary" to="/organizations">
              {t.organizationAction}
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="panel-note">
            <CircleHelp size={15} aria-hidden="true" />
            {t.organizationNote}
          </div>
        </section>
        <section className="audience-panel" aria-labelledby="audience-title">
          <h2 id="audience-title">{t.rightTitle}</h2>
          <div className="audience-item">
            <Building2 size={21} aria-hidden="true" />
            <div>
              <h3>{t.business}</h3>
              <p>{t.businessText}</p>
            </div>
          </div>
          <div className="audience-item">
            <Handshake size={21} aria-hidden="true" />
            <div>
              <h3>{t.association}</h3>
              <p>{t.associationText}</p>
            </div>
          </div>
          <Link className="text-link" to="/organizations">
            {t.organizationAction}
            <ArrowRight size={16} />
          </Link>
        </section>
      </div>
      <section className="modules-section" aria-labelledby="home-modules">
        <div className="section-heading">
          <div>
            <h2 id="home-modules">{t.modulesTitle}</h2>
            <p>{t.modulesDescription}</p>
          </div>
          <Link className="text-link" to="/modules">
            {t.allModules}
            <ArrowRight size={16} />
          </Link>
        </div>
        <ul className="module-previews">
          {modules.slice(0, 3).map((module) => (
            <ModuleItem key={module.id} module={module} compact />
          ))}
        </ul>
      </section>
      <section className="foundation-note">
        <div className="foundation-icon">
          <Settings2 size={21} aria-hidden="true" />
        </div>
        <div>
          <h2>{t.foundationTitle}</h2>
          <p>{t.foundationText}</p>
        </div>
        <Link className="text-link" to="/settings">
          {t.personalize}
          <ArrowRight size={16} />
        </Link>
      </section>
    </>
  );
}
export function OrganizationsPage() {
  const { messages: t } = usePreferences();
  return (
    <>
      <PageHeading title={t.organizationsTitle} description={t.organizationsDescription} />
      <section className="empty-panel">
        <Building2 size={43} strokeWidth={1.3} aria-hidden="true" />
        <h2>{t.organizationsEmptyTitle}</h2>
        <p>{t.organizationsEmptyText}</p>
        <button className="button" disabled aria-describedby="organization-unavailable">
          {t.createOrganization}
        </button>
        <small id="organization-unavailable">{t.notAvailable}</small>
      </section>
      <div className="organization-explanations">
        <section>
          <Building2 size={23} aria-hidden="true" />
          <h2>{t.business}</h2>
          <p>{t.businessDetail}</p>
          <Link className="text-link" to="/modules?audience=business">
            {t.explore}
            <ArrowRight size={16} />
          </Link>
        </section>
        <section>
          <Handshake size={23} aria-hidden="true" />
          <h2>{t.association}</h2>
          <p>{t.associationDetail}</p>
          <Link className="text-link" to="/modules?audience=association">
            {t.explore}
            <ArrowRight size={16} />
          </Link>
        </section>
      </div>
      <section className="plain-note">
        <h2>{t.orgPrincipleTitle}</h2>
        <p>{t.orgPrincipleText}</p>
      </section>
    </>
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
            <button
              className="icon-button"
              aria-label={t.clearSearch}
              onClick={() => update('q', '')}
            >
              <X size={16} />
            </button>
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
          <button className="button secondary" onClick={() => setParams({})}>
            {t.resetFilters}
          </button>
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
          <button
            className="button secondary"
            onClick={() => {
              refresh();
              void platform.refresh();
            }}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'is-refreshing' : ''} />
            {loading ? t.refreshing : t.refresh}
          </button>
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
        <div className="checked-at">
          {loading
            ? t.refreshing
            : data
              ? `${t.checkedAt} : ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(data.checkedAt))}`
              : t.connectionRecovery}
        </div>
      </section>
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
      <Link className="button primary" to="/">
        {t.home}
        <ArrowRight size={16} />
      </Link>
    </section>
  );
}
