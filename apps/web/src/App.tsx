import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router';
import {
  Building2,
  ChevronRight,
  CircleHelp,
  House,
  LayoutGrid,
  Menu,
  Settings2,
  ShieldCheck,
  SunMoon,
  X,
} from 'lucide-react';
import { usePreferences } from './preferences-context';
import { useBootstrap } from './bootstrap-context';
import {
  HomePage,
  ModulesPage,
  OrganizationsPage,
  SettingsPage,
  StatusPage,
  NotFoundPage,
} from './pages';

const navigation = [
  { to: '/', label: 'overview', icon: House },
  { to: '/organizations', label: 'organizations', icon: Building2 },
  { to: '/modules', label: 'modules', icon: LayoutGrid },
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
  return (
    <>
      <Brand {...(onNavigate ? { onNavigate } : {})} />
      <div className="workspace-label">
        <span className="workspace-symbol">O</span>
        <span>
          {t.workspace}
          <small>{t.preparation}</small>
        </span>
      </div>
      <nav aria-label={t.navigation} className="navigation">
        <div className="nav-group">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={onNavigate}>
              <Icon size={18} />
              {t[label]}
            </NavLink>
          ))}
        </div>
        <div className="nav-group nav-secondary">
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
      <button className="text-button" onClick={refresh} disabled={loading}>
        {loading ? t.refreshing : t.retry}
      </button>
    </div>
  );
}
export default function App() {
  const { messages: t, locale, setLocale, setTheme } = usePreferences();
  const location = useLocation();
  const drawer = useRef<HTMLDialogElement>(null);
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const page = [...navigation, ...secondary].find((item) => item.to === location.pathname)?.label;
  useEffect(() => {
    document.title = `${page ? t[page] : t.notFoundTitle} · Orkobi`;
    if (previousPath.current !== location.pathname) {
      main.current?.focus();
      window.scrollTo(0, 0);
      previousPath.current = location.pathname;
    }
  }, [location.pathname, page, t]);
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
          <button
            className="icon-button drawer-close"
            onClick={closeDrawer}
            aria-label={t.closeMenu}
          >
            <X size={20} />
          </button>
          <Navigation onNavigate={closeDrawer} />
        </div>
      </dialog>
      <div className="app-body">
        <header className="topbar">
          <button
            className="icon-button menu-toggle"
            aria-label={t.openMenu}
            aria-expanded={menuOpen}
            onClick={() => {
              drawer.current?.showModal();
              setMenuOpen(true);
            }}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumbs">
            <span>{t.workspace}</span>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{page ? t[page] : 'Orkobi'}</strong>
          </div>
          <div className="topbar-controls">
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
            <button
              className="icon-button"
              aria-label={t.themeToggle}
              title={t.themeToggle}
              onClick={() =>
                setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
              }
            >
              <SunMoon size={19} />
            </button>
          </div>
        </header>
        <main id="main" ref={main} tabIndex={-1} className="main-content">
          <ConnectionNotice />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/organizations" element={<OrganizationsPage />} />
            <Route path="/modules" element={<ModulesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/system" element={<StatusPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          <footer className="page-footer">
            <span>Orkobi</span>
            <span>{t.preparation}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
