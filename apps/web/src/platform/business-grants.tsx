import { useUnsavedChanges } from './unsaved-changes';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button, Notice, AppIcon } from '@orkobi/sdk-ui';
import type {
  BusinessDefinition,
  OrganizationRole,
  PlatformOrganization,
  RegisteredModule,
} from '@orkobi/contracts';
import { usePreferences } from '../preferences-context';
import { usePlatform } from './context';
import { usePlatformResource } from './hooks';
import { ResourceNotice, TaskForm } from './components';
import { useConfirm } from './confirm-context';
import { StatusPill } from '@orkobi/sdk-ui';
import { useBusinessCatalog } from './business/catalog-context';
export function BusinessGrants() {
  const { locale } = usePreferences(),
    fr = locale === 'fr',
    { post, session, refresh } = usePlatform(),
    confirm = useConfirm(),
    [params, setParams] = useSearchParams();
  const [savedRole, setSavedRole] = useState<string | null>(null);
  const [moduleRevision, setModuleRevision] = useState(0),
    [roleRevision, setRoleRevision] = useState(0),
    [retry, setRetry] = useState(0);
  const orgId = params.get('organization') ?? '',
    roleId = params.get('role') ?? '',
    moduleKey = params.get('module') ?? 'crm';
  const catalog = useBusinessCatalog(),
    organizations = usePlatformResource<PlatformOrganization[]>('admin/organizations', retry),
    roles = usePlatformResource<OrganizationRole[]>(
      orgId ? `admin/organizations/${orgId}/roles` : null,
      roleRevision + retry,
    ),
    modules = usePlatformResource<{ modules: RegisteredModule[] }>(
      'admin/modules',
      moduleRevision + retry,
    );
  const definition =
      catalog.data?.definitions.find((d) => d.key === moduleKey) ?? catalog.data?.definitions[0],
    role = roles.data?.find((r) => r.id === roleId),
    module = modules.data?.modules.find((m) => m.id === definition?.manifest.id);
  const update = (key: string, value: string) => {
    setSavedRole(null);
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key === 'organization') next.delete('role');
    setParams(next, { replace: true });
  };
  return (
    <section
      className="platform-panel business-grant-panel"
      aria-busy={catalog.loading || organizations.loading || roles.loading || modules.loading}
    >
      <div className="business-section-heading">
        <div>
          <h2>{fr ? 'Configurer un module métier' : 'Configure a business module'}</h2>
          <p>
            {fr
              ? 'Rendez le module disponible, choisissez qui peut l’utiliser, puis activez-le dans l’organisation.'
              : 'Make the module available, choose who may use it, then activate it in the organization.'}
          </p>
        </div>
      </div>
      <ResourceNotice
        loading={catalog.loading || organizations.loading}
        error={catalog.error || organizations.error || modules.error || roles.error}
        onRetry={() => {
          catalog.refresh();
          setRetry((value) => value + 1);
        }}
      />
      <label className="platform-field business-grant-select">
        <span>{fr ? 'Module à configurer' : 'Module to configure'}</span>
        <select
          name="businessModule"
          value={definition?.key ?? ''}
          disabled={!catalog.data}
          onChange={(event) => update('module', event.target.value)}
        >
          {catalog.data?.definitions.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label[locale]}
            </option>
          ))}
        </select>
      </label>
      {definition && (
        <>
          <section className="business-setup-step">
            <header>
              <AppIcon name={definition.icon} size={22} />
              <div>
                <h3>{fr ? 'Disponibilité sur la plateforme' : 'Platform availability'}</h3>
                <p>
                  {module
                    ? module.enabled
                      ? fr
                        ? 'Ce module est disponible pour les organisations.'
                        : 'This module is available to organizations.'
                      : fr
                        ? 'Activez-le pour permettre son utilisation dans les organisations.'
                        : 'Enable it to allow organizations to use it.'
                    : fr
                      ? 'Vérification de la disponibilité…'
                      : 'Checking availability…'}
                </p>
              </div>
              <StatusPill tone={module?.enabled ? 'positive' : 'muted'}>
                {module?.enabled
                  ? fr
                    ? 'Disponible'
                    : 'Available'
                  : fr
                    ? 'À activer'
                    : 'Not enabled'}
              </StatusPill>
            </header>
            {module && (
              <TaskForm
                submit={
                  module.enabled
                    ? fr
                      ? 'Désactiver sur la plateforme'
                      : 'Disable on platform'
                    : fr
                      ? 'Rendre disponible'
                      : 'Make available'
                }
                submitVariant={module.enabled ? 'secondary' : 'primary'}
                disabled={module.enabled && module.organizationCount > 0}
                onSave={async () => {
                  if (
                    module.enabled &&
                    !(await confirm(
                      fr
                        ? 'Désactiver ce module sur la plateforme ?'
                        : 'Disable this module on the platform?',
                      { danger: true },
                    ))
                  )
                    return false;
                  await post(`admin/modules/${module.id}`, { enabled: !module.enabled });
                  setModuleRevision((value) => value + 1);
                }}
              >
                <p>
                  {module.enabled && module.organizationCount > 0
                    ? fr
                      ? `Utilisé par ${module.organizationCount} organisation(s). Désactivez-le dans ces organisations avant de le retirer de la plateforme.`
                      : `Used by ${module.organizationCount} organization(s). Deactivate it there before disabling it on the platform.`
                    : fr
                      ? 'Les données restent conservées lors d’une désactivation.'
                      : 'Data is preserved when a module is deactivated.'}
                </p>
              </TaskForm>
            )}
          </section>
          <section className="business-setup-step">
            <h3>{fr ? 'Accès dans une organisation' : 'Organization access'}</h3>
            <div className="form-columns">
              <label className="platform-field">
                <span>{fr ? 'Organisation' : 'Organization'}</span>
                <select
                  name="organizationId"
                  value={orgId}
                  onChange={(event) => update('organization', event.target.value)}
                >
                  <option value="">
                    {fr ? 'Choisir une organisation' : 'Choose organization'}
                  </option>
                  {organizations.data?.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="platform-field">
                <span>{fr ? 'Rôle à configurer' : 'Role to configure'}</span>
                <select
                  name="roleId"
                  value={roleId}
                  disabled={!orgId || roles.loading}
                  onChange={(event) => update('role', event.target.value)}
                >
                  <option value="">
                    {roles.loading
                      ? fr
                        ? 'Chargement…'
                        : 'Loading…'
                      : fr
                        ? 'Choisir un rôle'
                        : 'Choose role'}
                  </option>
                  {roles.data?.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!orgId && (
              <p className="business-step-help">
                {fr
                  ? 'Sélectionnez l’organisation concernée pour consulter ses rôles.'
                  : 'Select the organization to view its roles.'}
              </p>
            )}
            {savedRole === `${definition.key}:${orgId}:${roleId}` && (
              <Notice tone="success">
                {fr
                  ? 'Les droits de ce rôle ont été enregistrés.'
                  : 'Role permissions have been saved.'}
              </Notice>
            )}
            {role && (
              <RolePermissions
                key={`${definition.key}/${orgId}/${role.id}/${role.permissions.join(',')}`}
                definition={definition}
                role={role}
                onDirty={() => setSavedRole(null)}
                onSave={async (permissions) => {
                  await post('admin/business/grants', {
                    module: definition.key,
                    organizationId: orgId,
                    roleId: role.id,
                    permissions,
                  });
                  setSavedRole(`${definition.key}:${orgId}:${role.id}`);
                  setRoleRevision((value) => value + 1);
                  if (session.activeOrganizationId === orgId) await refresh();
                }}
              />
            )}
          </section>
          <section className="business-setup-step">
            <h3>{fr ? 'Activation pour l’organisation' : 'Organization activation'}</h3>
            <p>
              {fr
                ? 'Une fois les droits accordés, un administrateur de l’organisation active le module depuis son catalogue.'
                : 'After permissions are granted, an organization administrator activates the module from their catalog.'}
            </p>
            {definition.manifest.dependencies.length > 0 && (
              <p>
                {fr ? 'Modules à activer d’abord : ' : 'Enable first: '}
                {definition.manifest.dependencies
                  .map(
                    (id) =>
                      catalog.data?.definitions.find((d) => d.manifest.id === id)?.label[locale] ??
                      id,
                  )
                  .join(', ')}
                .
              </p>
            )}
            <Button variant="secondary" to="/modules">
              {fr
                ? 'Ouvrir le catalogue de l’organisation courante'
                : 'Open current organization catalog'}
            </Button>
          </section>
        </>
      )}
    </section>
  );
}
function RolePermissions({
  definition,
  role,
  onSave,
  onDirty,
}: {
  definition: BusinessDefinition;
  role: OrganizationRole;
  onSave: (permissions: string[]) => Promise<void>;
  onDirty: () => void;
}) {
  const { locale } = usePreferences(),
    fr = locale === 'fr',
    [permissions, setPermissions] = useState(() =>
      definition.manifest.permissions
        .filter((p) => role.permissions.includes(p.key))
        .map((p) => p.key),
    );
  const missingRead =
      permissions.length > 0 && !permissions.includes(`orkobi.${definition.key}:read`),
    before = definition.manifest.permissions
      .filter((p) => role.permissions.includes(p.key))
      .map((p) => p.key),
    changed =
      before.length !== permissions.length || before.some((key) => !permissions.includes(key));
  const labels: Record<string, { fr: string; en: string }> = {
    read: { fr: 'Consulter les données', en: 'Read data' },
    write: { fr: 'Créer et modifier les fiches', en: 'Create and edit records' },
    approve: { fr: 'Approuver ou refuser les congés', en: 'Approve or reject leave' },
  };
  const [saving, setSaving] = useState(false);
  const guard = useUnsavedChanges(changed, saving);
  return (
    <TaskForm
      submit={fr ? 'Enregistrer les droits du rôle' : 'Save role permissions'}
      disabled={!changed || missingRead}
      onSave={async () => {
        setSaving(true);
        try {
          await onSave(permissions);
          guard.allow();
          return false;
        } finally {
          setSaving(false);
        }
      }}
    >
      <fieldset className="business-permission-options">
        <legend>{fr ? `Permissions de « ${role.name} »` : `Permissions for “${role.name}”`}</legend>
        {definition.manifest.permissions.map((permission) => (
          <label className="checkbox-label" key={permission.key}>
            <input
              type="checkbox"
              value={permission.key}
              checked={permissions.includes(permission.key)}
              onChange={(event) => {
                onDirty();
                setPermissions((old) =>
                  event.target.checked
                    ? [...old, permission.key]
                    : old.filter((key) => key !== permission.key),
                );
              }}
            />
            {labels[permission.key.split(':')[1] ?? '']?.[locale] ?? permission.description}
          </label>
        ))}
      </fieldset>
      {missingRead ? (
        <Notice tone="error">
          {fr
            ? 'La consultation est nécessaire pour créer, modifier ou approuver. Accordez-la, ou retirez les autres droits pour supprimer cet accès.'
            : 'Read permission is required to create, edit or approve. Grant it, or remove the other permissions to revoke access.'}
        </Notice>
      ) : (
        <p>
          {fr
            ? 'Ces choix concernent uniquement ce module et ce rôle. Les autres droits sont conservés.'
            : 'These choices affect only this module and role. Other permissions are preserved.'}
        </p>
      )}
    </TaskForm>
  );
}
