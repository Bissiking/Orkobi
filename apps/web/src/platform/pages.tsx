import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowRight, Building2, ShieldCheck, UserRound, LogOut } from 'lucide-react';
import { modulePermissions, organizationPermissions } from '@orkobi/contracts';
import type {
  AuditEntry,
  ModuleEntry,
  ModuleSummary,
  OrganizationRole,
  OrganizationMembership,
  PlatformOrganization,
  PlatformUser,
  SessionSummary,
} from '@orkobi/contracts';
import { usePlatform } from './context';
import { Field, PlatformHeading, TaskForm, ResourceNotice } from './components';
import { usePlatformCopy, usePlatformResource } from './hooks';
import { PlatformApiError } from './api';
import type { ReactNode } from 'react';
import type { PlatformCopy } from './copy';

const roleName = (role: OrganizationRole, t: PlatformCopy) =>
  role.builtin === 'admin'
    ? t.organizationAdmin
    : role.builtin === 'member'
      ? t.memberRole
      : role.name;

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
        <PlatformHeading title="Orkobi" description={t.databaseMissing} />
        <button className="button secondary" onClick={() => void refresh()}>
          {t.retry}
        </button>
        <Link className="text-link" to="/system">
          {t.status}
        </Link>
      </section>
    );
  if (!status.initialized && location.pathname !== '/setup')
    return <Navigate to="/setup" replace />;
  if (status.initialized && location.pathname === '/setup')
    return <Navigate to={session.user ? '/' : '/login'} replace />;
  if (status.initialized && !session.user && location.pathname !== '/login')
    return <Navigate to="/login" replace />;
  if (session.user && location.pathname === '/login') return <Navigate to="/" replace />;
  return children;
}
export function InstallationPage() {
  const t = usePlatformCopy(),
    { post, refresh } = usePlatform(),
    navigate = useNavigate();
  return (
    <section className="access-layout">
      <div className="access-intro">
        <ShieldCheck size={32} />
        <h1>{t.setup}</h1>
        <p>{t.setupText}</p>
        <p className="access-assurance">{t.securityNote}</p>
      </div>
      <div className="platform-panel">
        <TaskForm
          submit={t.setup}
          onSave={async (data) => {
            await post('setup', Object.fromEntries(data));
            await refresh();
            navigate('/login', { state: { installed: true } });
          }}
        >
          <Field label={t.setupToken} name="setupToken" type="password" help={t.setupHelp} />
          <Field label={t.name} name="name" />
          <Field label={t.email} name="email" type="email" />
          <Field label={t.password} name="password" type="password" help={t.passwordHelp} />
        </TaskForm>
      </div>
    </section>
  );
}
export function LoginPage() {
  const t = usePlatformCopy(),
    { post, refresh } = usePlatform(),
    navigate = useNavigate(),
    location = useLocation();
  return (
    <section className="access-layout">
      <div className="access-intro">
        <Building2 size={32} />
        <h1>{t.loginTitle}</h1>
        <p>{t.loginText}</p>
        <p className="access-assurance">{t.securityNote}</p>
      </div>
      <div className="platform-panel">
        {location.state?.installed && (
          <p className="form-success" role="status">
            {t.setupDone}
          </p>
        )}
        <TaskForm
          submit={t.signIn}
          onSave={async (data) => {
            await post('login', Object.fromEntries(data));
            await refresh();
            navigate('/');
          }}
        >
          <Field label={t.email} name="email" type="email" />
          <label className="platform-field">
            <span>{t.password}</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
        </TaskForm>
      </div>
    </section>
  );
}
export function WorkspacePage() {
  const t = usePlatformCopy(),
    { session } = usePlatform();
  return (
    <>
      <PlatformHeading
        title={`${t.overview}${session.user ? ` · ${session.user.name}` : ''}`}
        description={t.welcome}
      />
      <OrganizationList />
      <section className="workspace-tools">
        <Link className="platform-link-row" to="/profile">
          <UserRound size={22} />
          <div>
            <h2>{t.profile}</h2>
            <p>{t.sessionsHelp}</p>
          </div>
          <ArrowRight size={18} />
        </Link>
        {session.user?.platformAdmin && (
          <Link className="platform-link-row" to="/admin">
            <ShieldCheck size={22} />
            <div>
              <h2>{t.administration}</h2>
              <p>{t.adminHelp}</p>
            </div>
            <ArrowRight size={18} />
          </Link>
        )}
      </section>
    </>
  );
}
function OrganizationList() {
  const t = usePlatformCopy(),
    { session, post, refresh } = usePlatform(),
    navigate = useNavigate();
  return (
    <section className="platform-panel">
      <h2>{t.organizations}</h2>
      {!session.organizations.length ? (
        <div className="platform-empty">
          <Building2 size={30} />
          <h3>{t.noOrganizations}</h3>
          <p>{t.contactAdmin}</p>
          {session.user?.platformAdmin && (
            <Link className="button primary" to="/admin?tab=organizations">
              {t.createOrganization}
            </Link>
          )}
        </div>
      ) : (
        <div className="organization-list">
          {session.organizations.map((org) => (
            <div className="platform-row" key={org.id}>
              <Building2 size={24} />
              <div className="row-main">
                <h3>{org.name}</h3>
                <p>
                  {t[org.kind]} · {org.timezone}
                </p>
                {session.activeOrganizationId === org.id && (
                  <span className="form-success">{t.selected}</span>
                )}
              </div>
              <TaskForm
                submit={t.select}
                onSave={async () => {
                  await post(`organizations/${org.id}/select`, {});
                  await refresh();
                  navigate(`/organizations/${org.id}`);
                }}
              >
                <span className="sr-only">{org.name}</span>
              </TaskForm>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
export function ManagedOrganizationsPage() {
  const t = usePlatformCopy();
  return (
    <>
      <PlatformHeading title={t.organizations} description={t.organizationsHelp} />
      <OrganizationList />
    </>
  );
}
function OrganizationFields({ org }: { org?: PlatformOrganization }) {
  const t = usePlatformCopy();
  return (
    <>
      <Field label={t.organizationName} name="name" {...(org ? { value: org.name } : {})} />
      <label className="platform-field">
        <span>{t.kind}</span>
        <select name="kind" defaultValue={org?.kind ?? 'business'}>
          <option value="business">{t.business}</option>
          <option value="association">{t.association}</option>
        </select>
      </label>
      <div className="form-columns">
        <label className="platform-field">
          <span>{t.locale}</span>
          <select name="locale" defaultValue={org?.locale ?? 'fr'}>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </label>
        <Field label={t.timezone} name="timezone" value={org?.timezone ?? 'Europe/Paris'} />
      </div>
    </>
  );
}
export function OrganizationDetailPage() {
  const { id } = useParams(),
    { session } = usePlatform(),
    t = usePlatformCopy();
  const org = session.organizations.find((item) => item.id === id);
  if (!org)
    return (
      <>
        <PlatformHeading title={t.organizations} />
        <p role="alert">{t.forbidden}</p>
        <Link to="/organizations" className="text-link">
          {t.back}
        </Link>
      </>
    );
  return <OrganizationDetail key={org.id} org={org} />;
}
function OrganizationDetail({ org }: { org: PlatformOrganization }) {
  const t = usePlatformCopy(),
    { session, post, refresh } = usePlatform(),
    [revision, setRevision] = useState(0),
    [params, setParams] = useSearchParams();
  const permissions = session.organizations.find((item) => item.id === org.id)?.permissions ?? [];
  const tab = params.get('tab') ?? 'settings',
    base = `organizations/${org.id}`;
  const update = async () => {
    setRevision((value) => value + 1);
    await refresh();
  };
  return (
    <>
      <Link className="text-link" to="/organizations">
        {t.back}
      </Link>
      <PlatformHeading title={org.name} description={`${t[org.kind]} · ${org.timezone}`} />
      <nav className="platform-tabs" aria-label={org.name}>
        {(['settings', 'members', 'roles', 'audit'] as const)
          .filter(
            (item) =>
              item === 'settings' ||
              (item === 'audit'
                ? permissions.includes('audit:read')
                : permissions.includes('members:read')),
          )
          .map((item) => (
            <button
              key={item}
              className={tab === item ? 'active' : ''}
              aria-current={tab === item ? 'page' : undefined}
              onClick={() => setParams({ tab: item })}
            >
              {t[item]}
            </button>
          ))}
      </nav>
      {tab === 'settings' && (
        <section className="platform-panel">
          {permissions.includes('organization:write') ? (
            <TaskForm
              title={t.settings}
              onSave={async (data) => {
                await post(base, Object.fromEntries(data));
                await update();
              }}
            >
              <OrganizationFields org={org} />
            </TaskForm>
          ) : (
            <dl className="platform-details">
              <dt>{t.organizationName}</dt>
              <dd>{org.name}</dd>
              <dt>{t.locale}</dt>
              <dd>{org.locale}</dd>
              <dt>{t.timezone}</dt>
              <dd>{org.timezone}</dd>
            </dl>
          )}
        </section>
      )}
      {tab === 'members' && permissions.includes('members:read') && (
        <MembershipPanel
          base={base}
          revision={revision}
          canWrite={permissions.includes('members:write')}
          update={update}
        />
      )}
      {tab === 'roles' && permissions.includes('members:read') && (
        <RolePanel base={base} revision={revision} permissions={permissions} update={update} />
      )}
      {tab === 'audit' && permissions.includes('audit:read') && (
        <AuditPanel path={`${base}/audit`} />
      )}
    </>
  );
}
function MembershipPanel({
  base,
  revision,
  canWrite,
  update,
}: {
  base: string;
  revision: number;
  canWrite: boolean;
  update: () => Promise<void>;
}) {
  const t = usePlatformCopy(),
    { post } = usePlatform(),
    [selected, setSelected] = useState<OrganizationMembership | null>(null);
  const members = usePlatformResource<OrganizationMembership[]>(`${base}/members`, revision),
    roles = usePlatformResource<OrganizationRole[]>(`${base}/roles`, revision);
  return (
    <section className="platform-panel">
      <h2>{t.members}</h2>
      <ResourceNotice
        loading={members.loading || roles.loading}
        error={members.error || roles.error}
        onRetry={() => void update()}
      />
      <div className="table-scroll" role="region" aria-label={t.members} tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th>{t.name}</th>
              <th>{t.email}</th>
              <th>{t.role}</th>
              <th>{t.status}</th>
              {canWrite && (
                <th>
                  <span className="sr-only">{t.edit}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {members.data?.map((member) => (
              <tr key={member.userId}>
                <td>{member.name}</td>
                <td>{member.email}</td>
                <td>
                  {(() => {
                    const role = roles.data?.find((role) => role.id === member.roleId);
                    return role ? roleName(role, t) : '—';
                  })()}
                </td>
                <td>{member.active ? t.active : t.inactive}</td>
                {canWrite && (
                  <td>
                    <button className="text-button" onClick={() => setSelected(member)}>
                      {t.edit}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canWrite && roles.data && (
        <TaskForm
          key={selected?.userId ?? 'new'}
          title={selected ? `${t.editMember} · ${selected.name}` : t.addMember}
          reset={!selected}
          onSave={async (data) => {
            const active = data.get('active') === 'on';
            if (selected?.active && !active && !window.confirm(t.confirmDisable)) return false;
            await post(`${base}/members`, { ...Object.fromEntries(data), active });
            setSelected(null);
            await update();
          }}
        >
          <p>{t.memberHelp}</p>
          {selected && (
            <button type="button" className="text-button" onClick={() => setSelected(null)}>
              {t.cancel}
            </button>
          )}
          <Field
            label={t.email}
            name="email"
            type="email"
            readOnly={selected !== null}
            {...(selected ? { value: selected.email } : {})}
          />
          <label className="platform-field">
            <span>{t.role}</span>
            <select name="roleId" defaultValue={selected?.roleId}>
              {roles.data.map((role) => (
                <option key={role.id} value={role.id}>
                  {roleName(role, t)}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="active" defaultChecked={selected?.active ?? true} />
            {t.active}
          </label>
        </TaskForm>
      )}
    </section>
  );
}
const permissionLabels = {
  'organization:read': 'organizationRead',
  'organization:write': 'organizationWrite',
  'members:read': 'membersRead',
  'members:write': 'membersWrite',
  'roles:write': 'rolesWrite',
  'audit:read': 'auditRead',
  'modules:read': 'modulesRead',
  'modules:write': 'modulesWrite',
  'demo:read': 'demoRead',
  'demo:write': 'demoWrite',
} as const;
function RolePanel({
  base,
  revision,
  permissions,
  update,
}: {
  base: string;
  revision: number;
  permissions: readonly string[];
  update: () => Promise<void>;
}) {
  const t = usePlatformCopy(),
    { post } = usePlatform(),
    [selected, setSelected] = useState<OrganizationRole | null>(null),
    roles = usePlatformResource<OrganizationRole[]>(`${base}/roles`, revision);
  return (
    <section className="platform-panel">
      <h2>{t.roles}</h2>
      <p>{t.roleHelp}</p>
      <ResourceNotice loading={roles.loading} error={roles.error} onRetry={() => void update()} />
      <div className="role-list">
        {roles.data?.map((role) => (
          <div className="role-row" key={role.id}>
            <div>
              <h3>
                {roleName(role, t)} {role.builtin && <small>{t.builtin}</small>}
              </h3>
              <p>
                {role.permissions
                  .map(
                    (key) =>
                      t[permissionLabels[key as keyof typeof permissionLabels] ?? 'auditRead'],
                  )
                  .join(' · ') || '—'}
              </p>
            </div>
            {!role.builtin && permissions.includes('roles:write') && (
              <button className="text-button" onClick={() => setSelected(role)}>
                {t.edit}
              </button>
            )}
          </div>
        ))}
      </div>
      {permissions.includes('roles:write') && (
        <TaskForm
          key={selected?.id ?? 'new'}
          title={selected ? `${t.editRole} · ${selected.name}` : t.createRole}
          reset={!selected}
          onSave={async (data) => {
            await post(`${base}/roles`, {
              name: data.get('name'),
              permissions: data.getAll('permissions'),
              ...(selected ? { id: selected.id } : {}),
            });
            setSelected(null);
            await update();
          }}
        >
          <Field label={t.roleName} name="name" {...(selected ? { value: selected.name } : {})} />
          {selected && (
            <button type="button" className="text-button" onClick={() => setSelected(null)}>
              {t.cancel}
            </button>
          )}
          <fieldset className="permission-list">
            <legend>{t.permissions}</legend>
            {organizationPermissions
              .filter((key) => permissions.includes(key))
              .map((key) => (
                <label className="checkbox-label" key={key}>
                  <input
                    type="checkbox"
                    name="permissions"
                    value={key}
                    defaultChecked={
                      selected?.permissions.includes(key) ?? key === 'organization:read'
                    }
                  />
                  {t[permissionLabels[key]]}
                </label>
              ))}
            {modulePermissions
              .filter((key) => permissions.includes(key))
              .map((key) => (
                <label className="checkbox-label" key={key}>
                  <input
                    type="checkbox"
                    name="permissions"
                    value={key}
                    defaultChecked={selected?.permissions.includes(key) ?? false}
                  />
                  {t[permissionLabels[key]]}
                </label>
              ))}
          </fieldset>
        </TaskForm>
      )}
    </section>
  );
}
export function ProfilePage() {
  const t = usePlatformCopy(),
    { session, post, refresh } = usePlatform(),
    [revision, setRevision] = useState(0),
    sessions = usePlatformResource<SessionSummary[]>('sessions', revision);
  return (
    <>
      <PlatformHeading title={t.profile} description={session.user?.email} />
      <div className="platform-split">
        <section className="platform-panel">
          <TaskForm
            title={t.profile}
            onSave={async (data) => {
              await post('profile', Object.fromEntries(data));
              await refresh();
            }}
          >
            <Field label={t.name} name="name" value={session.user?.name ?? ''} />
            <p>{session.user?.platformAdmin ? t.platformAdmin : t.user}</p>
          </TaskForm>
        </section>
        <section className="platform-panel">
          <h2>{t.sessions}</h2>
          <p>{t.sessionsHelp}</p>
          <ResourceNotice
            loading={sessions.loading}
            error={sessions.error}
            onRetry={() => setRevision((value) => value + 1)}
          />
          {sessions.data?.map((item) => (
            <div className="session-row" key={item.id}>
              <div>
                <h3>{item.current ? t.currentSession : t.sessions}</h3>
                <p>
                  {t.created} : {new Date(item.createdAt).toLocaleString()}
                </p>
                <p>
                  {t.expires} : {new Date(item.expiresAt).toLocaleString()}
                </p>
              </div>
              <TaskForm
                submit={t.revoke}
                onSave={async () => {
                  await post('sessions/revoke', { sessionId: item.id });
                  await refresh();
                  setRevision((value) => value + 1);
                }}
              >
                <span className="sr-only">{new Date(item.createdAt).toLocaleString()}</span>
              </TaskForm>
            </div>
          ))}
        </section>
      </div>
    </>
  );
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
      <button
        className="icon-button"
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
      </button>
      {error && <span role="alert">{t.unknown}</span>}
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
          if (!id) return;
          setPending(true);
          setError(false);
          void post(`organizations/${id}/select`, {})
            .then(async () => {
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
      {error && <small role="alert">{t.forbidden}</small>}
    </label>
  );
}
export function AdministrationPage() {
  const t = usePlatformCopy(),
    { session } = usePlatform(),
    [params, setParams] = useSearchParams(),
    tab = params.get('tab') ?? 'users';
  if (!session.user?.platformAdmin) return <p role="alert">{t.forbidden}</p>;
  return (
    <>
      <PlatformHeading title={t.administration} description={t.adminHelp} />
      <nav className="platform-tabs" aria-label={t.administration}>
        {(['users', 'organizations', 'audit'] as const).map((key) => (
          <button
            key={key}
            aria-current={tab === key ? 'page' : undefined}
            className={tab === key ? 'active' : ''}
            onClick={() => setParams({ tab: key })}
          >
            {t[key]}
          </button>
        ))}
      </nav>
      {tab === 'users' && <UsersAdmin />}
      {tab === 'organizations' && <OrganizationsAdmin />}
      {tab === 'audit' && <AuditPanel path="admin/audit" />}
      <p className="list-note">
        {t.limit} · {t.version} {__APP_VERSION__}
      </p>
    </>
  );
}
function UsersAdmin() {
  const t = usePlatformCopy(),
    { post, refresh } = usePlatform(),
    [revision, setRevision] = useState(0),
    users = usePlatformResource<PlatformUser[]>('admin/users', revision),
    [selected, setSelected] = useState<PlatformUser | null>(null);
  return (
    <section className="platform-panel">
      <h2>{t.users}</h2>
      <ResourceNotice
        loading={users.loading}
        error={users.error}
        onRetry={() => setRevision((value) => value + 1)}
      />
      <div className="table-scroll" role="region" aria-label={t.users} tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th>{t.name}</th>
              <th>{t.email}</th>
              <th>{t.role}</th>
              <th>{t.status}</th>
              <th>
                <span className="sr-only">{t.edit}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.data?.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.platformAdmin ? t.platformAdmin : t.user}</td>
                <td>{user.active ? t.active : t.inactive}</td>
                <td>
                  <button className="text-button" onClick={() => setSelected(user)}>
                    {t.edit}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TaskForm
        key={selected?.id ?? 'new'}
        title={selected ? t.edit : t.createUser}
        reset={!selected}
        submit={selected ? t.save : t.createUser}
        onSave={async (data) => {
          const active = data.get('active') === 'on';
          if (selected?.active && !active && !window.confirm(t.confirmDisable)) return false;
          await post(selected ? `admin/users/${selected.id}` : 'admin/users', {
            ...Object.fromEntries(data),
            active,
            platformAdmin: data.get('platformAdmin') === 'on',
          });
          setSelected(null);
          setRevision((value) => value + 1);
          await refresh();
        }}
      >
        <Field label={t.name} name="name" {...(selected ? { value: selected.name } : {})} />
        {!selected && (
          <>
            <Field label={t.email} name="email" type="email" />
            <Field label={t.password} name="password" type="password" help={t.passwordHelp} />
          </>
        )}
        <label className="checkbox-label">
          <input
            name="platformAdmin"
            type="checkbox"
            defaultChecked={selected?.platformAdmin ?? false}
          />
          {t.platformAdmin}
        </label>
        {selected && (
          <>
            <label className="checkbox-label">
              <input name="active" type="checkbox" defaultChecked={selected.active} />
              {t.active}
            </label>
            <p>{t.disabledNotice}</p>
            <button className="text-button" type="button" onClick={() => setSelected(null)}>
              {t.createUser}
            </button>
          </>
        )}
      </TaskForm>
    </section>
  );
}
function OrganizationsAdmin() {
  const t = usePlatformCopy(),
    { post, refresh } = usePlatform(),
    [revision, setRevision] = useState(0),
    orgs = usePlatformResource<PlatformOrganization[]>('admin/organizations', revision),
    users = usePlatformResource<PlatformUser[]>('admin/users', revision),
    [selected, setSelected] = useState<PlatformOrganization | null>(null);
  const update = async () => {
    setRevision((value) => value + 1);
    await refresh();
  };
  return (
    <>
      <section className="platform-panel">
        <h2>{t.organizations}</h2>
        <ResourceNotice
          loading={orgs.loading || users.loading}
          error={orgs.error || users.error}
          onRetry={() => void update()}
        />
        <div className="table-scroll" role="region" aria-label={t.organizations} tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>{t.organizationName}</th>
                <th>{t.kind}</th>
                <th>{t.status}</th>
                <th>
                  <span className="sr-only">{t.manage}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orgs.data?.map((org) => (
                <tr key={org.id}>
                  <td>{org.name}</td>
                  <td>{t[org.kind]}</td>
                  <td>{org.active ? t.active : t.inactive}</td>
                  <td>
                    <button className="text-button" onClick={() => setSelected(org)}>
                      {t.manage}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.data && (
          <TaskForm
            key={selected?.id ?? 'new'}
            reset={!selected}
            title={selected ? t.settings : t.createOrganization}
            submit={selected ? t.save : t.createOrganization}
            onSave={async (data) => {
              const active = data.get('active') === 'on';
              if (selected?.active && !active && !window.confirm(t.confirmDisable)) return false;
              await post(selected ? `admin/organizations/${selected.id}` : 'admin/organizations', {
                ...Object.fromEntries(data),
                active,
              });
              setSelected(null);
              await update();
            }}
          >
            <OrganizationFields {...(selected ? { org: selected } : {})} />
            {!selected ? (
              <label className="platform-field">
                <span>{t.owner}</span>
                <select name="ownerId" required>
                  {users.data
                    .filter((user) => user.active)
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} · {user.email}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <>
                <label className="checkbox-label">
                  <input type="checkbox" name="active" defaultChecked={selected.active} />
                  {t.active}
                </label>
                <button className="text-button" type="button" onClick={() => setSelected(null)}>
                  {t.createOrganization}
                </button>
              </>
            )}
          </TaskForm>
        )}
      </section>
      {selected && (
        <MembershipPanel
          key={selected.id}
          base={`admin/organizations/${selected.id}`}
          revision={revision}
          canWrite
          update={update}
        />
      )}
    </>
  );
}
function AuditPanel({ path }: { path: string }) {
  const t = usePlatformCopy(),
    [revision, setRevision] = useState(0),
    audit = usePlatformResource<AuditEntry[]>(path, revision);
  const events: Record<string, string> = {
    'instance.initialized': t.setup,
    'identity.login': t.signIn,
    'identity.login_failed': `${t.signIn} · ${t.invalid_argument}`,
    'identity.logout': t.signOut,
    'identity.session_revoked': t.revoke,
    'identity.profile_updated': t.profile,
    'identity.user_created': t.createUser,
    'identity.user_updated': `${t.users} · ${t.edit}`,
    'organization.created': t.createOrganization,
    'organization.updated': t.settings,
    'organization.settings_updated': t.settings,
    'organization.selected': t.selected,
    'organization.role_saved': t.roles,
    'organization.membership_saved': t.delegate,
    'module.enabled': t.moduleEnabledLabel,
    'module.disabled': t.moduleDisabledLabel,
    'module.organization_activated': t.moduleOrgActivatedLabel,
    'module.organization_deactivated': t.moduleOrgDeactivatedLabel,
    'module.orkobi.demo.notes.created': t.noteCreatedLabel,
    'module.orkobi.demo.notes.updated': t.noteUpdatedLabel,
    'module.orkobi.demo.notes.deleted': t.noteDeletedLabel,
  };
  return (
    <section className="platform-panel">
      <h2>{t.recentAudit}</h2>
      <ResourceNotice
        loading={audit.loading}
        error={audit.error}
        onRetry={() => setRevision((value) => value + 1)}
      />
      {audit.data?.length === 0 && <p>{t.noAudit}</p>}
      <div className="table-scroll" role="region" aria-label={t.audit} tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th>{t.date}</th>
              <th>{t.event}</th>
              <th>{t.actor}</th>
              <th>{t.target}</th>
            </tr>
          </thead>
          <tbody>
            {audit.data?.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.createdAt).toLocaleString()}</td>
                <td>{events[entry.event] ?? entry.event}</td>
                <td>{entry.actorName ?? '—'}</td>
                <td>{entry.targetName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ModulesSection() {
  const t = usePlatformCopy(),
    { session, post } = usePlatform(),
    [revision, setRevision] = useState(0);
  const modules = usePlatformResource<{ modules: ModuleSummary[] }>(
    session.user && session.activeOrganizationId ? 'modules' : null,
    revision,
  );
  const permissions =
    session.organizations.find((org) => org.id === session.activeOrganizationId)?.permissions ?? [];
  return (
    <section className="platform-panel" aria-busy={modules.loading}>
      <h2>{t.modulesTitle}</h2>
      <p>{t.modulesHelp}</p>
      {!session.user && <p>{t.modulesSignIn}</p>}
      {session.user && !session.activeOrganizationId && <p>{t.selectOrganizationModules}</p>}
      <ResourceNotice
        loading={modules.loading}
        error={modules.error}
        onRetry={() => setRevision((value) => value + 1)}
      />
      {modules.data && (
        <div className="role-list">
          {modules.data.modules.map((module) => (
            <div className="role-row" key={module.id}>
              <div>
                <h3>
                  {module.name} <small>v{module.version}</small>{' '}
                  <span className="small-label">
                    {module.active
                      ? t.moduleActive
                      : module.enabled
                        ? t.moduleInactive
                        : t.moduleUnavailable}
                  </span>
                </h3>
                <p>{module.description}</p>
                {module.missingCapabilities.length > 0 && (
                  <p className="form-error">
                    {t.moduleUnavailable} : {module.missingCapabilities.join(', ')}
                  </p>
                )}
                {module.unsatisfiedDependencies.length > 0 && (
                  <p>{module.unsatisfiedDependencies.join(', ')}</p>
                )}
              </div>
              <div className="row-actions">
                {module.active && module.id === 'orkobi.demo' && (
                  <Link className="text-link" to="/modules/demo">
                    {t.openModule}
                  </Link>
                )}
                {permissions.includes('modules:write') && module.enabled && (
                  <TaskForm
                    submit={module.active ? t.deactivate : t.activate}
                    onSave={async () => {
                      await post(
                        `modules/${module.id}/${module.active ? 'deactivate' : 'activate'}`,
                        {},
                      );
                      setRevision((value) => value + 1);
                    }}
                  >
                    <span className="sr-only">{module.name}</span>
                  </TaskForm>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
export function DemoNotesPage() {
  const t = usePlatformCopy(),
    { session, post } = usePlatform(),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<ModuleEntry | null>(null),
    [deleting, setDeleting] = useState<string | null>(null),
    [deleteError, setDeleteError] = useState<false | string>(false);
  const permissions =
    session.organizations.find((org) => org.id === session.activeOrganizationId)?.permissions ?? [];
  const canRead = permissions.includes('demo:read');
  const canWrite = permissions.includes('demo:write');
  const modules = usePlatformResource<{ modules: ModuleSummary[] }>(
    session.activeOrganizationId ? 'modules' : null,
    revision,
  );
  const summary = modules.data?.modules.find((module) => module.id === 'orkobi.demo');
  const notes = usePlatformResource<{ entries: ModuleEntry[] }>(
    summary?.active && canRead ? 'modules/orkobi.demo/data/notes' : null,
    revision,
  );
  const update = () => setRevision((value) => value + 1);
  const deleteNote = async (note: ModuleEntry) => {
    if (deleting || !window.confirm(t.confirmDeleteNote)) return;
    setDeleting(note.id);
    setDeleteError(false);
    try {
      await post(`modules/orkobi.demo/data/notes/${note.id}/delete`, {});
      if (selected?.id === note.id) setSelected(null);
      update();
    } catch (error) {
      setDeleteError(error instanceof PlatformApiError ? error.code : 'unknown');
    } finally {
      setDeleting(null);
    }
  };
  return (
    <>
      <Link className="text-link" to="/modules">
        {t.modulesTitle}
      </Link>
      <PlatformHeading title={t.demoTitle} description={t.demoHelp} />
      {!session.activeOrganizationId ? (
        <p role="alert">{t.selectOrganizationModules}</p>
      ) : !summary && (modules.loading || modules.error) ? (
        <ResourceNotice loading={modules.loading} error={modules.error} onRetry={update} />
      ) : !summary?.active ? (
        <section className="platform-panel">
          <p role="alert">{t.demoInactive}</p>
          <Link className="button secondary" to="/modules">
            {t.modulesTitle}
          </Link>
        </section>
      ) : (
        <>
          <ResourceNotice loading={notes.loading} error={notes.error} onRetry={update} />
          {deleteError && (
            <p className="form-error" role="alert">
              {deleteError in t ? t[deleteError as keyof typeof t] : t.unknown}
            </p>
          )}
          {!canRead && <p role="alert">{t.forbidden}</p>}
          {notes.data?.entries.length === 0 && <p>{t.demoNoteEmpty}</p>}
          {notes.data && notes.data.entries.length > 0 && (
            <div className="table-scroll" role="region" aria-label={t.demoTitle} tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>{t.demoNoteTitle}</th>
                    <th>{t.created}</th>
                    <th>{t.noteUpdated}</th>
                    {canWrite && (
                      <th>
                        <span className="sr-only">{t.edit}</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {notes.data.entries.map((note) => (
                    <tr key={note.id}>
                      <td>{note.values.title}</td>
                      <td>{new Date(note.createdAt).toLocaleString()}</td>
                      <td>{new Date(note.updatedAt).toLocaleString()}</td>
                      {canWrite && (
                        <td>
                          <button
                            className="text-button"
                            disabled={deleting !== null}
                            onClick={() => setSelected(note)}
                          >
                            {t.edit}
                          </button>{' '}
                          <button
                            className="text-button"
                            disabled={deleting !== null}
                            onClick={() => void deleteNote(note)}
                          >
                            {deleting === note.id ? t.saving : t.deleteNote}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p>{t.notesLimit}</p>
          {canWrite && (
            <TaskForm
              key={selected?.id ?? 'new'}
              title={selected ? t.editNote : t.createNote}
              reset={!selected}
              onSave={async (data) => {
                const values = { title: data.get('title'), content: data.get('content') };
                await post(
                  selected
                    ? `modules/orkobi.demo/data/notes/${selected.id}`
                    : 'modules/orkobi.demo/data/notes',
                  values,
                );
                setSelected(null);
                update();
              }}
            >
              <Field
                label={t.demoNoteTitle}
                name="title"
                {...(selected ? { value: selected.values.title } : {})}
              />
              <label className="platform-field">
                <span>{t.demoNoteContent}</span>
                <textarea
                  name="content"
                  maxLength={4000}
                  rows={4}
                  defaultValue={selected?.values.content ?? ''}
                />
                <small>{t.demoNoteContentHelp}</small>
              </label>
              {selected && (
                <button type="button" className="text-button" onClick={() => setSelected(null)}>
                  {t.cancel}
                </button>
              )}
            </TaskForm>
          )}
        </>
      )}
    </>
  );
}
