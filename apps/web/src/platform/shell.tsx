import { confirmContextChange } from './unsaved-changes';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { UserRound, LogOut } from 'lucide-react';
import { Button } from '@orkobi/sdk-ui';
import { usePlatform } from './context';
import { usePlatformCopy } from './hooks';
import { PageHeading, ResourceNotice } from './components';
export function PlatformGate({ children }: { children: ReactNode }) {
  const { loading, error, status, session, refresh } = usePlatform(),
    t = usePlatformCopy(),
    location = useLocation();
  if (['/settings', '/system', '/modules'].includes(location.pathname)) return children;
  if (loading || error)
    return (
      <section className="platform-panel">
        <ResourceNotice loading={loading} error={error} onRetry={() => void refresh()} />
      </section>
    );
  if (!status?.databaseReady)
    return (
      <section className="platform-panel">
        <PageHeading title="Orkobi" description={t.databaseMissing} />
        <Button variant="secondary" onClick={() => void refresh()}>
          {t.retry}
        </Button>
        <Button variant="text" to="/system">
          {t.status}
        </Button>
      </section>
    );
  if (location.pathname === '/oidc/callback') return children;
  if (!status.initialized && location.pathname !== '/setup')
    return <Navigate to="/setup" replace />;
  if (status.initialized && location.pathname === '/setup')
    return <Navigate to={session.user ? '/' : '/login'} replace />;
  if (status.initialized && !session.user && location.pathname !== '/login')
    return <Navigate to="/login" replace />;
  if (session.user && location.pathname === '/login') return <Navigate to="/" replace />;
  return children;
}
export function AccountControls() {
  const t = usePlatformCopy(),
    { session, post, refresh } = usePlatform(),
    navigate = useNavigate(),
    [error, setError] = useState(false),
    [pending, setPending] = useState(false);
  if (!session.user) return null;
  return (
    <div className="account-controls">
      <Link to="/profile" className="account-link">
        <UserRound size={16} />
        <span>{session.user.name}</span>
      </Link>
      <Button
        variant="icon"
        disabled={pending}
        aria-label={t.signOut}
        title={t.signOut}
        onClick={() => {
          setPending(true);
          setError(false);
          void post('logout', {})
            .then(async () => {
              await refresh();
              navigate('/login');
            })
            .catch(() => setError(true))
            .finally(() => setPending(false));
        }}
      >
        <LogOut size={17} />
      </Button>
      {error && <span role="alert">{t.signOutFailed}</span>}
    </div>
  );
}
export function OrganizationSelector() {
  const t = usePlatformCopy(),
    { session, post, refresh } = usePlatform(),
    navigate = useNavigate(),
    [pending, setPending] = useState(false),
    [error, setError] = useState(false);
  if (!session.user || !session.organizations.length) return null;
  return (
    <label className="organization-selector">
      <span className="sr-only">{t.chooseOrganization}</span>
      <select
        aria-label={t.chooseOrganization}
        value={session.activeOrganizationId ?? ''}
        disabled={pending}
        onChange={(event) => {
          const id = event.target.value;
          if (!id || id === session.activeOrganizationId) return;
          setPending(true);
          setError(false);
          void confirmContextChange()
            .then(async (accepted) => {
              if (!accepted) return;
              await post(`organizations/${id}/select`, {});
              await refresh();
              navigate(`/organizations/${id}`);
            })
            .catch(() => setError(true))
            .finally(() => setPending(false));
        }}
      >
        <option value="" disabled>
          {t.chooseOrganization}
        </option>
        {session.organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      {error && <small role="alert">{t.organizationSelectFailed}</small>}
    </label>
  );
}
