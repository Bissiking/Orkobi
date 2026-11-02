import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { integrationScopes } from '@orkobi/contracts';
import type {
  IntegrationTokenSummary,
  LinkedIdentity,
  MfaStatus,
  OidcStatus,
  PlatformOrganization,
} from '@orkobi/contracts';
import { usePlatform } from './context';
import { Field, PlatformHeading, ResourceNotice, TaskForm } from './components';
import { usePlatformCopy, usePlatformResource } from './hooks';
import { useAdvancedCopy } from './advanced-copy';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import './advanced.css';

interface LoginResult {
  mfaRequired?: boolean;
  challenge?: string;
  linked?: boolean;
}
function pendingMfa() {
  try {
    return sessionStorage.getItem('orkobi.mfa.challenge');
  } catch {
    return null;
  }
}
function MfaCode({ recovery = false }: { recovery?: boolean }) {
  const a = useAdvancedCopy();
  return (
    <label className="platform-field">
      <span>{recovery ? a.recoveryCode : a.code}</span>
      <input
        name="code"
        autoComplete="one-time-code"
        inputMode={recovery ? 'text' : 'numeric'}
        autoCapitalize="characters"
        spellCheck={false}
        required
        maxLength={recovery ? 11 : 6}
        pattern={recovery ? '(?:[0-9]{6}|[A-Za-z2-7]{5}-[A-Za-z2-7]{5})' : '[0-9]{6}'}
      />
    </label>
  );
}
function PasswordField({ current = false }: { current?: boolean }) {
  const a = useAdvancedCopy();
  return (
    <label className="platform-field">
      <span>{current ? a.currentPassword : a.newPassword}</span>
      <input
        name={current ? 'currentPassword' : 'password'}
        type="password"
        autoComplete={current ? 'current-password' : 'new-password'}
        required
        minLength={current ? undefined : 15}
        maxLength={128}
      />
    </label>
  );
}
function OidcStart({ link = false }: { link?: boolean }) {
  const { post } = usePlatform(),
    a = useAdvancedCopy();
  return (
    <TaskForm
      submit={link ? a.oidcLink : a.oidcSignIn}
      onSave={async () => {
        const result = await post<{ url: string; state: string }>('oidc/start', { link });
        sessionStorage.setItem('orkobi.oidc.state', result.state);
        window.location.assign(result.url);
      }}
    >
      <span className="sr-only">{a.oidc}</span>
    </TaskForm>
  );
}
export function AdvancedLoginPage() {
  const t = usePlatformCopy(),
    a = useAdvancedCopy(),
    { post, refresh } = usePlatform(),
    navigate = useNavigate(),
    location = useLocation();
  const [challenge, setChallenge] = useState(pendingMfa);
  const oidc = usePlatformResource<OidcStatus>('oidc/status');
  const finish = async (result: LoginResult) => {
    if (result.mfaRequired && result.challenge) {
      setChallenge(result.challenge);
      sessionStorage.setItem('orkobi.mfa.challenge', result.challenge);
      return;
    }
    sessionStorage.removeItem('orkobi.mfa.challenge');
    await refresh();
    navigate('/');
  };
  return (
    <section className="access-layout">
      <div className="access-intro">
        <h1>{challenge ? a.mfaLogin : t.loginTitle}</h1>
        <p>{challenge ? a.mfaLoginHelp : t.loginText}</p>
        <p className="access-assurance">{t.securityNote}</p>
      </div>
      <div className="platform-panel">
        {location.state?.installed && <Notice tone="success">{t.setupDone}</Notice>}
        {challenge ? (
          <TaskForm
            submit={a.confirm}
            onSave={async (data) =>
              finish(
                await post<LoginResult>('mfa/login', {
                  challenge,
                  code: String(data.get('code')).toUpperCase(),
                }),
              )
            }
          >
            <MfaCode recovery />
            <Button
              variant="text"
              type="button"
              onClick={() => {
                sessionStorage.removeItem('orkobi.mfa.challenge');
                setChallenge(null);
              }}
            >
              {a.cancel}
            </Button>
          </TaskForm>
        ) : (
          <>
            <TaskForm
              submit={t.signIn}
              onSave={async (data) =>
                finish(await post<LoginResult>('login', Object.fromEntries(data)))
              }
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
            <ResourceNotice
              loading={oidc.loading}
              error={oidc.error}
              onRetry={() => window.location.reload()}
            />
            {oidc.data?.enabled && <OidcStart />}
          </>
        )}
      </div>
    </section>
  );
}
export function OidcCallbackPage() {
  const a = useAdvancedCopy(),
    { post, refresh } = usePlatform(),
    navigate = useNavigate(),
    [failed, setFailed] = useState(false),
    started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const state = params.get('state'),
      code = params.get('code');
    // Retire immédiatement le code de l'historique et des URL partagées.
    window.history.replaceState(null, '', window.location.pathname);
    let expected: string | null = null;
    try {
      expected = sessionStorage.getItem('orkobi.oidc.state');
      sessionStorage.removeItem('orkobi.oidc.state');
    } catch {
      /* échec explicite ci-dessous */
    }
    if (!state || state !== expected || !code || params.has('error')) {
      setFailed(true);
      return;
    }
    void post<LoginResult>('oidc/callback', { state, code })
      .then(async (result) => {
        if (result.mfaRequired && result.challenge) {
          sessionStorage.setItem('orkobi.mfa.challenge', result.challenge);
          navigate('/login', { replace: true });
          return;
        }
        await refresh();
        navigate(result.linked ? '/profile' : '/', { replace: true });
      })
      .catch(() => setFailed(true));
  }, [post, refresh, navigate]);
  return (
    <section className="platform-panel">
      <PlatformHeading title={a.oidcCallback} />
      <p role={failed ? 'alert' : 'status'}>{failed ? a.callbackFailed : a.callbackHelp}</p>
      {failed && (
        <Button variant="text" to="/login">
          {a.cancel}
        </Button>
      )}
    </section>
  );
}
export function AccountSecurity({ onUpdate }: { onUpdate: () => void }) {
  const a = useAdvancedCopy(),
    t = usePlatformCopy(),
    { post } = usePlatform(),
    [revision, setRevision] = useState(0);
  const mfa = usePlatformResource<MfaStatus>('mfa/status', revision),
    identities = usePlatformResource<LinkedIdentity[]>('oidc', revision),
    oidc = usePlatformResource<OidcStatus>('oidc/status');
  const [secret, setSecret] = useState(''),
    [codes, setCodes] = useState<string[]>([]);
  const update = () => {
    setRevision((value) => value + 1);
    onUpdate();
  };
  return (
    <div className="platform-split account-security">
      <section className="platform-panel">
        <TaskForm
          title={a.password}
          reset
          onSave={async (data) => {
            await post('profile/password', Object.fromEntries(data));
            update();
          }}
        >
          <PasswordField current />
          <PasswordField />
          <p>{t.passwordHelp}</p>
        </TaskForm>
      </section>
      <section className="platform-panel">
        <h2>{a.mfa}</h2>
        <ResourceNotice loading={mfa.loading} error={mfa.error} onRetry={update} />
        {mfa.data && (
          <>
            <p>
              {mfa.data.enabled ? a.enabled : a.disabled} · {a.remaining} :{' '}
              {mfa.data.recoveryCodesRemaining}
            </p>
            {!mfa.data.enabled && !secret && (
              <TaskForm
                submit={a.enroll}
                onSave={async () => {
                  const result = await post<{ secret: string }>('mfa/enroll', {});
                  setSecret(result.secret);
                  setCodes([]);
                  update();
                }}
              >
                <span className="sr-only">{a.mfa}</span>
              </TaskForm>
            )}
            {secret && (
              <TaskForm
                submit={a.confirm}
                onSave={async (data) => {
                  const result = await post<{ recoveryCodes: string[] }>('mfa/confirm', {
                    code: data.get('code'),
                  });
                  setSecret('');
                  setCodes(result.recoveryCodes);
                  update();
                }}
              >
                <p>{a.mfaHelp}</p>
                <Field label={a.secret} name="secret" value={secret} readOnly />
                <MfaCode />
              </TaskForm>
            )}
            {mfa.data.enabled && (
              <TaskForm
                title={a.disableMfa}
                submit={a.disable}
                reset
                onSave={async (data) => {
                  await post('mfa/disable', { code: String(data.get('code')).toUpperCase() });
                  setCodes([]);
                  update();
                }}
              >
                <MfaCode recovery />
              </TaskForm>
            )}
          </>
        )}
        {codes.length > 0 && (
          <div className="recovery-codes">
            <h3>{a.recovery}</h3>
            <p role="status">{a.recoveryHelp}</p>
            <ul>
              {codes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <section className="platform-panel">
        <h2>{a.oidc}</h2>
        <ResourceNotice
          loading={identities.loading || oidc.loading}
          error={identities.error || oidc.error}
          onRetry={update}
        />
        {identities.data?.length === 0 && <p>{a.noIdentities}</p>}
        {identities.data?.map((identity) => (
          <div className="session-row" key={`${identity.issuer}:${identity.subject}`}>
            <div className="identity-issuer">
              <p>{identity.issuer}</p>
            </div>
            <TaskForm
              submit={a.unlink}
              onSave={async () => {
                if (!window.confirm(a.unlinkConfirm)) return false;
                await post('oidc/unlink', identity);
                update();
              }}
            >
              <span className="sr-only">{identity.issuer}</span>
            </TaskForm>
          </div>
        ))}
        {oidc.data?.enabled ? <OidcStart link /> : oidc.data && <p>{a.oidcOff}</p>}
      </section>
    </div>
  );
}
export function PasswordResetForm({ userId }: { userId: string }) {
  const a = useAdvancedCopy(),
    { post, refresh } = usePlatform();
  return (
    <TaskForm
      title={a.resetPassword}
      submit={a.resetPassword}
      reset
      onSave={async (data) => {
        if (!window.confirm(a.resetConfirm)) return false;
        await post(`admin/users/${userId}/password`, Object.fromEntries(data));
        await refresh();
      }}
    >
      <PasswordField />
    </TaskForm>
  );
}
export function OrganizationIntegrations({
  orgId,
  canWrite,
}: {
  orgId: string;
  canWrite: boolean;
}) {
  const a = useAdvancedCopy(),
    { post } = usePlatform(),
    [revision, setRevision] = useState(0),
    resource = usePlatformResource<{ enabled: boolean }>(
      `organizations/${orgId}/integrations`,
      revision,
    );
  return (
    <section className="platform-panel">
      <h2>{a.integrations}</h2>
      <ResourceNotice
        loading={resource.loading}
        error={resource.error}
        onRetry={() => setRevision((n) => n + 1)}
      />
      {resource.data &&
        (canWrite ? (
          <TaskForm
            key={String(resource.data.enabled)}
            onSave={async (data) => {
              await post(`organizations/${orgId}/integrations`, {
                enabled: data.get('enabled') === 'on',
              });
              setRevision((n) => n + 1);
            }}
          >
            <label className="checkbox-label">
              <input type="checkbox" name="enabled" defaultChecked={resource.data.enabled} />
              {a.orgSwitch}
            </label>
          </TaskForm>
        ) : (
          <p>{resource.data.enabled ? a.enabled : a.disabled}</p>
        ))}
    </section>
  );
}
export function IntegrationsAdmin() {
  const a = useAdvancedCopy(),
    t = usePlatformCopy(),
    { post } = usePlatform(),
    [revision, setRevision] = useState(0),
    [token, setToken] = useState('');
  const settings = usePlatformResource<{ enabled: boolean }>('admin/integrations', revision),
    tokens = usePlatformResource<IntegrationTokenSummary[]>('admin/integration-tokens', revision),
    orgs = usePlatformResource<PlatformOrganization[]>('admin/organizations');
  const update = () => setRevision((n) => n + 1);
  return (
    <section className="platform-panel">
      <h2>{a.integrations}</h2>
      <p>{a.integrationsHelp}</p>
      <ResourceNotice
        loading={settings.loading || tokens.loading || orgs.loading}
        error={settings.error || tokens.error || orgs.error}
        onRetry={update}
      />
      {settings.data && (
        <TaskForm
          key={String(settings.data.enabled)}
          onSave={async (data) => {
            await post('admin/integrations', { enabled: data.get('enabled') === 'on' });
            update();
          }}
        >
          <label className="checkbox-label">
            <input type="checkbox" name="enabled" defaultChecked={settings.data.enabled} />
            {a.globalSwitch}
          </label>
        </TaskForm>
      )}
      <TaskForm
        title={a.createToken}
        submit={a.createToken}
        reset
        onSave={async (data) => {
          const expires = String(data.get('expiresAt') ?? '');
          const result = await post<{ token: string }>('admin/integration-tokens', {
            name: data.get('name'),
            organizationId: data.get('organizationId') || null,
            scopes: data.getAll('scopes'),
            expiresAt: expires ? new Date(expires).toISOString() : null,
          });
          setToken(result.token);
          update();
        }}
      >
        <Field label={t.name} name="name" />
        <label className="platform-field">
          <span>{t.organizations}</span>
          <select name="organizationId">
            <option value="">{a.allOrganizations}</option>
            {orgs.data?.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>{a.scopes}</legend>
          {integrationScopes.map((scope) => (
            <label className="checkbox-label" key={scope}>
              <input type="checkbox" name="scopes" value={scope} />
              {scope}
            </label>
          ))}
        </fieldset>
        <label className="platform-field">
          <span>{a.expiration}</span>
          <input type="datetime-local" name="expiresAt" required />
        </label>
      </TaskForm>
      {token && (
        <div role="status">
          <p>{a.tokenOnce}</p>
          <Field key={token} label={a.token} name="token" value={token} readOnly />
        </div>
      )}
      {tokens.data?.length === 0 && <p>{a.noTokens}</p>}
      {tokens.data?.map((item) => (
        <div className="session-row" key={item.id}>
          <div>
            <h3>{item.name}</h3>
            <p>
              {item.organizationName ?? a.allOrganizations} · {item.scopes.join(', ')}
            </p>
            <p>
              {a.expiration} :{' '}
              {item.expiresAt ? new Date(item.expiresAt).toLocaleString() : a.never} ·{' '}
              {item.revokedAt
                ? a.revoked
                : item.expiresAt && Date.parse(item.expiresAt) <= Date.now()
                  ? a.expired
                  : a.enabled}
            </p>
          </div>
          {!item.revokedAt && (
            <TaskForm
              submit={a.revoke}
              onSave={async () => {
                if (!window.confirm(a.revokeConfirm)) return false;
                await post(`admin/integration-tokens/${item.id}/revoke`, {});
                update();
              }}
            >
              <span className="sr-only">{item.name}</span>
            </TaskForm>
          )}
        </div>
      ))}
    </section>
  );
}
