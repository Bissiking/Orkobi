import { BusinessCatalogProvider } from './platform/business/catalog';
import { useBusinessCatalog } from './platform/business/catalog-context';
import { routeBreadcrumbs, isModulesRoute } from './platform/routes';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router';
import {
  Building2,
  ChevronRight,
  CircleHelp,
  House,
  LayoutGrid,
  Clock,
  Menu,
  Settings2,
  ShieldCheck,
  SunMoon,
  X,
} from 'lucide-react';
import { usePreferences } from './preferences-context';
import { useBootstrap } from './bootstrap-context';
import { PlatformGate, AccountControls, OrganizationSelector } from './platform/shell';
import { Skeleton } from './platform/components';
import { usePlatform } from './platform/context';
import { usePlatformCopy } from './platform/hooks';
import { Button } from '@orkobi/sdk-ui';

const BusinessPage = lazy(() =>
  import('./platform/business').then((module) => ({ default: module.BusinessPage })),
);
const PluginPage = lazy(() =>
  import('./platform/plugins').then((module) => ({ default: module.PluginPage })),
);
const JobsPage = lazy(() =>
  import('./platform/jobs').then((module) => ({ default: module.JobsPage })),
);

const InstallationPage = lazy(() =>
  import('./platform/pages').then((module) => ({ default: module.InstallationPage })),
);
const WorkspacePage = lazy(() =>
  import('./platform/pages').then((module) => ({ default: module.WorkspacePage })),
);
const ManagedOrganizationsPage = lazy(() =>
  import('./platform/pages').then((module) => ({ default: module.ManagedOrganizationsPage })),
);
const OrganizationDetailPage = lazy(() =>
  import('./platform/pages').then((module) => ({ default: module.OrganizationDetailPage })),
);
const ProfilePage = lazy(() =>
  import('./platform/pages').then((module) => ({ default: module.ProfilePage })),
);
const AdministrationPage = lazy(() =>
  import('./platform/pages').then((module) => ({ default: module.AdministrationPage })),
);
const DemoNotesPage = lazy(() =>
  import('./platform/pages').then((module) => ({ default: module.DemoNotesPage })),
);
const ModulesPage = lazy(() =>
  import('./pages').then((module) => ({ default: module.ModulesPage })),
);
const SettingsPage = lazy(() =>
  import('./pages').then((module) => ({ default: module.SettingsPage })),
);
const StatusPage = lazy(() => import('./pages').then((module) => ({ default: module.StatusPage })));
const NotFoundPage = lazy(() =>
  import('./pages').then((module) => ({ default: module.NotFoundPage })),
);
const LoginPage = lazy(() =>
  import('./platform/advanced').then((module) => ({ default: module.AdvancedLoginPage })),
);
const OidcCallbackPage = lazy(() =>
  import('./platform/advanced').then((module) => ({ default: module.OidcCallbackPage })),
);

const navigation = [
  { to: '/', label: 'overview', icon: House },
  { to: '/organizations', label: 'organizations', icon: Building2 },
  { to: '/modules', label: 'modules', icon: LayoutGrid },
  { to: '/jobs', label: 'jobs', icon: Clock },
] as const;
const secondary = [
  { to: '/system', label: 'system', icon: ShieldCheck },
  { to: '/settings', label: 'settings', icon: Settings2 },
] as const;
function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link to="/" className="brand" onClick={onNavigate} aria-label="Orkobi">
      <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="currentColor" />
        <g fill="var(--on-accent)">
          <rect x="8" y="8" width="6" height="6" rx="1.5" />
          <rect x="18" y="8" width="6" height="6" rx="1.5" />
          <rect x="8" y="18" width="6" height="6" rx="1.5" />
          <rect x="18" y="18" width="6" height="6" rx="1.5" opacity=".55" />
        </g>
      </svg>
      <span>
        Orkobi<span className="experimental">EXP</span>
      </span>
    </Link>
  );
}
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { messages: t } = usePreferences();
  const location = useLocation();
  const p = usePlatformCopy(),
    { session } = usePlatform();
  const activeOrganization = session.organizations.find(
    (org) => org.id === session.activeOrganizationId,
  );
  return (
    <>
      <Brand {...(onNavigate ? { onNavigate } : {})} />
      <div className="workspace-label">
        <span className="workspace-symbol">O</span>
        <span>
          {activeOrganization?.name ?? t.workspace}
          <small>
            {session.user
              ? session.user.platformAdmin
                ? p.platformAdmin
                : session.user.name
              : t.preparation}
          </small>
        </span>
      </div>
      <nav aria-label={t.navigation} className="navigation">
        <div className="nav-group">
          {navigation.map(({ to, label, icon: Icon }) =>
            to === '/modules' ? (
              <Link
                key={to}
                to={to}
                onClick={onNavigate}
                className={isModulesRoute(location.pathname) ? 'active' : ''}
                aria-current={isModulesRoute(location.pathname) ? 'page' : undefined}
              >
                <Icon size={18} />
                {t[label]}
              </Link>
            ) : (
              <NavLink key={to} to={to} end={to === '/'} onClick={onNavigate}>
                <Icon size={18} />
                {t[label]}
              </NavLink>
            ),
          )}
        </div>
        <div className="nav-group nav-secondary">
          {session.user?.platformAdmin && (
            <NavLink to="/admin" onClick={onNavigate}>
              <ShieldCheck size={18} />
              {p.administration}
            </NavLink>
          )}
          {session.user && (
            <NavLink to="/profile" onClick={onNavigate}>
              <Building2 size={18} />
              {p.profile}
            </NavLink>
          )}
          {secondary.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={onNavigate}>
              <Icon size={18} />
              {t[label]}
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="sidebar-footer">
        <span>{t.slogan}</span>
        <small>
          {t.version}
          <br />
          <span className="version-number">{__APP_VERSION__}</span>
        </small>
      </div>
    </>
  );
}
function ConnectionNotice() {
  const { messages: t } = usePreferences();
  const { data, error, loading, refresh } = useBootstrap();
  if (!error && data?.core.status !== 'unavailable') return null;
  return (
    <div className="connection-notice" role="status">
      <CircleHelp size={18} aria-hidden="true" />
      <span>{error ? t.connectionError : t.coreError}</span>
      <Button variant="text" onClick={refresh} disabled={loading}>
        {loading ? t.refreshing : t.retry}
      </Button>
    </div>
  );
}
export default function App() {
  const { session } = usePlatform();
  const context = `${session.user?.id ?? ''}:${session.activeOrganizationId ?? ''}`;
  return (
    <BusinessCatalogProvider key={context}>
      <AppShell />
    </BusinessCatalogProvider>
  );
}
function AppShell() {
  const { messages: t, locale, setLocale, setTheme } = usePreferences();
  const { session } = usePlatform();
  const moduleContext = `${session.user?.id ?? ''}:${session.activeOrganizationId ?? ''}`;
  const p = usePlatformCopy();
  const location = useLocation();
  const drawer = useRef<HTMLDialogElement>(null);
  const main = useRef<HTMLElement>(null);
  const focusPath = `${location.pathname}:${new URLSearchParams(location.search).get('edit') === '1'}`;
  const previousPath = useRef(focusPath);
  const [menuOpen, setMenuOpen] = useState(false);
  const catalog = useBusinessCatalog();
  const breadcrumbs = routeBreadcrumbs(
    location.pathname,
    locale,
    t,
    p,
    catalog.data?.definitions ?? [],
    session,
  );
  const pageTitle = breadcrumbs.at(-1)?.label ?? t.notFoundTitle;
  useEffect(() => {
    document.title = `${pageTitle} · Orkobi`;
    if (previousPath.current !== focusPath) {
      main.current?.focus();
      window.scrollTo(0, 0);
      previousPath.current = focusPath;
    }
  }, [focusPath, pageTitle]);
  useEffect(() => {
    const media = matchMedia('(min-width: 880px)');
    const close = () => {
      if (media.matches) drawer.current?.close();
    };
    media.addEventListener('change', close);
    return () => media.removeEventListener('change', close);
  }, []);
  const closeDrawer = () => drawer.current?.close();
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        {t.skip}
      </a>
      <aside className="sidebar">
        <Navigation />
      </aside>
      <dialog
        ref={drawer}
        className="mobile-drawer"
        aria-label={t.navigation}
        onClose={() => setMenuOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDrawer();
        }}
      >
        <div className="drawer-content">
          <Button
            variant="icon"
            className="drawer-close"
            onClick={closeDrawer}
            aria-label={t.closeMenu}
          >
            <X size={20} />
          </Button>
          <Navigation onNavigate={closeDrawer} />
        </div>
      </dialog>
      <div className="app-body">
        <header className="topbar">
          <Button
            variant="icon"
            className="menu-toggle"
            aria-label={t.openMenu}
            aria-expanded={menuOpen}
            onClick={() => {
              drawer.current?.showModal();
              setMenuOpen(true);
            }}
          >
            <Menu size={21} />
          </Button>
          <nav className="breadcrumbs" aria-label={p.breadcrumb}>
            <ol>
              {breadcrumbs.map((item, index) => (
                <li key={`${item.to}/${index}`}>
                  {index > 0 && <ChevronRight size={14} aria-hidden="true" />}
                  {index === breadcrumbs.length - 1 ? (
                    <strong aria-current="page">{item.label}</strong>
                  ) : (
                    <Link to={item.to}>{item.label}</Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="topbar-controls">
            <OrganizationSelector />
            <AccountControls />
            <label className="language-control">
              <span className="sr-only">{t.language}</span>
              <select
                value={locale}
                onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'fr')}
              >
                <option value="fr">FR</option>
                <option value="en">EN</option>
              </select>
            </label>
            <Button
              variant="icon"
              aria-label={t.themeToggle}
              title={t.themeToggle}
              onClick={() =>
                setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
              }
            >
              <SunMoon size={19} />
            </Button>
          </div>
        </header>
        <main id="main" ref={main} tabIndex={-1} className="main-content">
          <ConnectionNotice />
          <PlatformGate>
            <Suspense fallback={<Skeleton status={p.loading} />}>
              <Routes>
                <Route path="/" element={<WorkspacePage />} />
                <Route path="/setup" element={<InstallationPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/oidc/callback" element={<OidcCallbackPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/admin" element={<AdministrationPage />} />
                <Route path="/organizations" element={<ManagedOrganizationsPage />} />
                <Route path="/organizations/:id" element={<OrganizationDetailPage />} />
                <Route path="/modules" element={<ModulesPage key={moduleContext} />} />
                <Route path="/modules/demo" element={<DemoNotesPage key={moduleContext} />} />
                <Route path="/plugins/:id/:page?" element={<PluginPage key={moduleContext} />} />
                <Route
                  path="/business/:module/:entity?/:id?"
                  element={<BusinessPage key={moduleContext} />}
                />
                <Route path="/jobs" element={<JobsPage key={moduleContext} />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/system" element={<StatusPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </PlatformGate>
          <footer className="page-footer">
            <span>Orkobi</span>
            <span>
              {t.version} {__APP_VERSION__}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
