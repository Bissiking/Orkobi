import { useState } from 'react';
import { Button, Notice } from '@orkobi/sdk-ui';
import type {
  BusinessDefinition,
  OrganizationRole,
  PlatformOrganization,
  ModuleSummary,
} from '@orkobi/contracts';
import { usePreferences } from '../preferences-context';
import { usePlatform } from './context';
import { usePlatformResource } from './hooks';
import { ResourceNotice, TaskForm } from './components';
export function BusinessGrants() {
  const fr = usePreferences().locale === 'fr',
    { post } = usePlatform();
  const [revision, setRevision] = useState(0),
    [orgId, setOrgId] = useState(''),
    [roleId, setRoleId] = useState(''),
    [moduleKey, setModuleKey] = useState('crm');
  const catalog = usePlatformResource<{ definitions: BusinessDefinition[] }>('business', revision);
  const organizations = usePlatformResource<PlatformOrganization[]>(
    'admin/organizations',
    revision,
  );
  const roles = usePlatformResource<OrganizationRole[]>(
    orgId ? `admin/organizations/${orgId}/roles` : null,
    revision,
  );
  const modules = usePlatformResource<{ modules: ModuleSummary[] }>('admin/modules', revision);
  const definition = catalog.data?.definitions.find((d) => d.key === moduleKey),
    role = roles.data?.find((r) => r.id === roleId);
  return (
    <section className="platform-panel">
      <h2>
        {fr ? 'Modules métier et droits explicites' : 'Business modules and explicit permissions'}
      </h2>
      <Notice>
        {fr
          ? 'Activez le module sur la plateforme, accordez les droits au rôle, puis activez-le dans l’organisation depuis Modules. Les ventes nécessitent CRM et Catalogue ; les stocks nécessitent Catalogue.'
          : 'Enable the platform module, grant role permissions, then activate it in the organization from Modules. Sales require CRM and Catalog; Stock requires Catalog.'}
      </Notice>
      <ResourceNotice
        loading={catalog.loading || organizations.loading || roles.loading || modules.loading}
        error={catalog.error || organizations.error || roles.error || modules.error}
        onRetry={() => setRevision((v) => v + 1)}
      />
      <label className="platform-field">
        <span>{fr ? 'Module' : 'Module'}</span>
        <select value={moduleKey} onChange={(e) => setModuleKey(e.target.value)}>
          {catalog.data?.definitions.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label[fr ? 'fr' : 'en']}
            </option>
          ))}
        </select>
      </label>
      {definition && (
        <>
          <TaskForm
            submit={
              modules.data?.modules.find((m) => m.id === definition.manifest.id)?.enabled
                ? fr
                  ? 'Désactiver sur la plateforme'
                  : 'Disable on platform'
                : fr
                  ? 'Activer sur la plateforme'
                  : 'Enable on platform'
            }
            onSave={async () => {
              const active = modules.data?.modules.find(
                (m) => m.id === definition.manifest.id,
              )?.enabled;
              if (
                active &&
                !window.confirm(
                  fr
                    ? 'Désactiver pour toutes les organisations ?'
                    : 'Disable for all organizations?',
                )
              )
                return false;
              await post(`admin/modules/${definition.manifest.id}`, { enabled: !active });
              setRevision((v) => v + 1);
            }}
          >
            <p>{definition.manifest.description}</p>
          </TaskForm>
          <TaskForm
            key={`${moduleKey}:${orgId}:${roleId}:${revision}:${role?.permissions.join(',') ?? ''}`}
            disabled={!role}
            submit={fr ? 'Appliquer les permissions' : 'Apply permissions'}
            onSave={async (data) => {
              await post('admin/business/grants', {
                module: moduleKey,
                organizationId: orgId,
                roleId,
                permissions: data.getAll('permissions'),
              });
              setRevision((v) => v + 1);
            }}
          >
            <label className="platform-field">
              <span>{fr ? 'Organisation' : 'Organization'}</span>
              <select
                required
                value={orgId}
                onChange={(e) => {
                  setOrgId(e.target.value);
                  setRoleId('');
                }}
              >
                <option value="">{fr ? 'Choisir' : 'Choose'}</option>
                {organizations.data?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="platform-field">
              <span>{fr ? 'Rôle' : 'Role'}</span>
              <select required value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                <option value="">{fr ? 'Choisir' : 'Choose'}</option>
                {roles.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            {definition.manifest.permissions.map((p) => (
              <label className="checkbox-label" key={p.key}>
                <input
                  type="checkbox"
                  name="permissions"
                  value={p.key}
                  defaultChecked={role?.permissions.includes(p.key) ?? false}
                />
                {p.key}
              </label>
            ))}
            <p>
              {fr
                ? 'La consultation est requise pour toute action. Les droits existants des autres modules sont conservés.'
                : 'Read permission is required for every action. Existing permissions for other modules are preserved.'}
            </p>
          </TaskForm>
        </>
      )}
      <Button variant="text" to="/modules">
        {fr ? 'Ouvrir les modules de l’organisation' : 'Open organization modules'}
      </Button>
    </section>
  );
}
