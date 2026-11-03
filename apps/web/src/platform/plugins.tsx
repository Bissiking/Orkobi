import { useState } from 'react';
import { useParams } from 'react-router';
import { Button, Field, Notice, AppIcon } from '@orkobi/sdk-ui';
import type {
  PluginArtifact,
  PluginManifest,
  RegisteredModule,
  ModuleEntry,
  PlatformOrganization,
  OrganizationRole,
} from '@orkobi/contracts';
import { usePreferences } from '../preferences-context';
import { usePlatform } from './context';
import { usePlatformResource } from './hooks';
import { PlatformHeading, ResourceNotice, TaskForm } from './components';

interface InstalledPlugin {
  id: string;
  manifest: PluginManifest;
  digest: string;
  installed: boolean;
  installedAt: string;
}
export function PluginsAdmin() {
  const fr = usePreferences().locale === 'fr',
    { post } = usePlatform();
  const [revision, setRevision] = useState(0),
    [artifact, setArtifact] = useState<PluginArtifact | null>(null),
    [review, setReview] = useState<{ digest: string; manifest: PluginManifest } | null>(null),
    [fileError, setFileError] = useState(false);
  const list = usePlatformResource<{ plugins: InstalledPlugin[] }>('admin/plugins', revision);
  const moduleStates = usePlatformResource<{ modules: RegisteredModule[] }>(
    'admin/modules',
    revision,
  );
  const refresh = () => setRevision((value) => value + 1);
  const previous = list.data?.plugins.find((p) => p.id === review?.manifest.module.id);
  return (
    <>
      <section className="platform-panel">
        <div className="page-heading">
          <h2>{fr ? 'Installer une extension' : 'Install an extension'}</h2>
          <Button variant="secondary" to="/admin?tab=store">
            {fr ? 'Parcourir le Store' : 'Browse Store'}
          </Button>
        </div>
        <p>
          {fr
            ? 'Chargez un paquet Orkobi, vérifiez ses ressources et ses droits, puis confirmez son installation. Il restera désactivé jusqu’à votre choix.'
            : 'Load an Orkobi package, review its resources and permissions, then confirm installation. It will remain disabled until you enable it.'}
        </p>
        <TaskForm
          disabled={!artifact}
          submit={fr ? 'Vérifier le paquet' : 'Validate package'}
          onSave={async () => {
            if (!artifact) throw new Error();
            setReview(await post('admin/plugins/validate', { artifact }));
          }}
        >
          <Field
            label={fr ? 'Paquet de l’extension (.json)' : 'Extension package (.json)'}
            type="file"
            name="artifact"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              setReview(null);
              setArtifact(null);
              setFileError(false);
              if (!file) return;
              if (file.size > 90000) {
                setFileError(true);
                return;
              }
              void file
                .text()
                .then((text) => {
                  setArtifact(JSON.parse(text) as PluginArtifact);
                })
                .catch(() => setFileError(true));
            }}
          />
          {fileError && (
            <Notice tone="error">
              {fr
                ? 'Ce fichier est invalide ou trop volumineux.'
                : 'This file is invalid or too large.'}
            </Notice>
          )}
        </TaskForm>
      </section>
      {review && (
        <section className="platform-panel">
          <h2>
            {review.manifest.module.name} · {review.manifest.module.version}
          </h2>
          <p>{review.manifest.module.description}</p>
          <dl className="plugin-review">
            <dt>{fr ? 'Identifiant' : 'Identifier'}</dt>
            <dd>{review.manifest.module.id}</dd>
            <dt>{fr ? 'Empreinte du paquet' : 'Package digest'}</dt>
            <dd>
              <code>{review.digest}</code>
            </dd>
            <dt>{fr ? 'Ressources' : 'Resources'}</dt>
            <dd>{review.manifest.module.entities.map((e) => e.entity).join(', ') || '—'}</dd>
            <dt>{fr ? 'Dépendances' : 'Dependencies'}</dt>
            <dd>{review.manifest.module.dependencies.join(', ') || '—'}</dd>
          </dl>
          <h3>{fr ? 'Permissions demandées' : 'Requested permissions'}</h3>
          <ul>
            {review.manifest.module.permissions.map((p) => (
              <li key={p.key}>
                {p.description} <small>({p.key})</small>
              </li>
            ))}
          </ul>
          <TaskForm
            submit={
              previous
                ? fr
                  ? 'Mettre à jour'
                  : 'Update'
                : fr
                  ? 'Installer désactivée'
                  : 'Install disabled'
            }
            onSave={async () => {
              await post('admin/plugins/install', {
                artifact,
                digest: review.digest,
                confirmId: review.manifest.module.id,
                expectedPreviousDigest: previous?.digest ?? null,
              });
              setReview(null);
              setArtifact(null);
              refresh();
            }}
          >
            <label className="checkbox-label">
              <input type="checkbox" required />
              {fr
                ? 'J’ai vérifié la provenance de ce paquet et les droits déclarés.'
                : 'I have reviewed this package’s source and declared permissions.'}
            </label>
            <Notice>
              {fr
                ? 'Les droits devront être accordés séparément aux rôles d’organisation.'
                : 'Permissions must be granted separately to organization roles.'}
            </Notice>
          </TaskForm>
        </section>
      )}
      <section className="platform-panel">
        <h2>{fr ? 'Extensions enregistrées' : 'Registered extensions'}</h2>
        <ResourceNotice loading={list.loading} error={list.error} onRetry={refresh} />
        {list.data?.plugins.length === 0 && (
          <p>{fr ? 'Aucune extension installée.' : 'No extensions installed.'}</p>
        )}
        {list.data?.plugins.map((plugin) => (
          <div className="plugin-installed" key={plugin.id}>
            <h3>
              {plugin.manifest.module.name} · {plugin.manifest.module.version}
            </h3>
            <p>
              {plugin.installed
                ? fr
                  ? 'Installée'
                  : 'Installed'
                : fr
                  ? 'Retirée · données conservées'
                  : 'Removed · data retained'}
            </p>
            {plugin.installed && (
              <>
                <TaskForm
                  disabled={moduleStates.loading || !!moduleStates.error}
                  submit={
                    moduleStates.data?.modules.find((m) => m.id === plugin.id)?.enabled
                      ? fr
                        ? 'Désactiver sur la plateforme'
                        : 'Disable on platform'
                      : fr
                        ? 'Activer sur la plateforme'
                        : 'Enable on platform'
                  }
                  onSave={async () => {
                    const enabled = !!moduleStates.data?.modules.find((m) => m.id === plugin.id)
                      ?.enabled;
                    await post(`admin/modules/${plugin.id}`, { enabled: !enabled });
                    refresh();
                  }}
                >
                  <p>
                    {fr
                      ? 'L’activation dans chaque organisation se fait ensuite depuis Modules.'
                      : 'Then enable the extension in each organization from Modules.'}
                  </p>
                </TaskForm>
                <PluginGrant plugin={plugin} />
                <details>
                  <summary>{fr ? 'Retirer cette extension' : 'Remove this extension'}</summary>
                  <TaskForm
                    submit={fr ? 'Confirmer le retrait' : 'Confirm removal'}
                    onSave={async () => {
                      await post(`admin/plugins/${plugin.id}/remove`, {
                        confirmId: plugin.id,
                        digest: plugin.digest,
                      });
                      refresh();
                    }}
                  >
                    <p>
                      {fr
                        ? 'Désactivez d’abord l’extension dans chaque organisation puis sur la plateforme. Les données seront conservées.'
                        : 'First disable the extension in each organization and on the platform. Data will be retained.'}
                    </p>
                    <label className="checkbox-label">
                      <input type="checkbox" required />
                      {fr ? 'Je confirme le retrait.' : 'I confirm removal.'}
                    </label>
                  </TaskForm>
                </details>
              </>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
function PluginGrant({ plugin }: { plugin: InstalledPlugin }) {
  const fr = usePreferences().locale === 'fr',
    { post, refresh: refreshSession } = usePlatform();
  const [roleRevision, setRoleRevision] = useState(0);
  const [orgId, setOrgId] = useState(''),
    [roleId, setRoleId] = useState('');
  const organizations = usePlatformResource<PlatformOrganization[]>('admin/organizations');
  const roles = usePlatformResource<OrganizationRole[]>(
    orgId ? `admin/organizations/${orgId}/roles` : null,
    roleRevision,
  );
  const role = roles.data?.find((role) => role.id === roleId);
  return (
    <details>
      <summary>
        {fr ? 'Accorder ou retirer des permissions' : 'Grant or revoke permissions'}
      </summary>
      <ResourceNotice
        loading={organizations.loading || roles.loading}
        error={organizations.error || roles.error}
        onRetry={() => {
          setOrgId('');
          setRoleId('');
        }}
      />
      <TaskForm
        key={`${orgId}:${roleId}`}
        submit={fr ? 'Appliquer aux droits du rôle' : 'Apply role permissions'}
        onSave={async (data) => {
          await post(`admin/plugins/${plugin.id}/grants`, {
            confirmId: plugin.id,
            organizationId: orgId,
            roleId,
            permissions: data.getAll('permissions'),
          });
          setRoleRevision((value) => value + 1);
          await refreshSession();
        }}
      >
        <label className="platform-field">
          <span>{fr ? 'Organisation' : 'Organization'}</span>
          <select
            required
            value={orgId}
            onChange={(event) => {
              setOrgId(event.target.value);
              setRoleId('');
            }}
          >
            <option value="">{fr ? 'Choisir une organisation' : 'Choose an organization'}</option>
            {organizations.data?.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
        <label className="platform-field">
          <span>{fr ? 'Rôle' : 'Role'}</span>
          <select required value={roleId} onChange={(event) => setRoleId(event.target.value)}>
            <option value="">{fr ? 'Choisir un rôle' : 'Choose a role'}</option>
            {roles.data?.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        {plugin.manifest.module.permissions.map((p) => (
          <label className="checkbox-label" key={p.key}>
            <input
              type="checkbox"
              name="permissions"
              value={p.key}
              defaultChecked={role?.permissions.includes(p.key) ?? false}
            />
            {p.description}
          </label>
        ))}
        <label className="checkbox-label">
          <input type="checkbox" required />
          {fr
            ? 'Je confirme ces droits pour ce rôle et cette organisation.'
            : 'I confirm these permissions for this role and organization.'}
        </label>
      </TaskForm>
    </details>
  );
}
export function PluginPage() {
  const { id, page: pageKey } = useParams(),
    { locale } = usePreferences(),
    fr = locale === 'fr',
    { session } = usePlatform();
  const { data, error, loading } = usePlatformResource<{
    plugins: { id: string; manifest: PluginManifest }[];
  }>(session.activeOrganizationId ? 'plugins' : null);
  const plugin = data?.plugins.find((plugin) => plugin.id === id);
  const page = plugin?.manifest.frontend.pages.find(
    (page) => page.key === (pageKey ?? plugin.manifest.frontend.pages[0]?.key),
  );
  const entity = plugin?.manifest.module.entities.find((e) => e.entity === page?.entity);
  const permissions =
    session.organizations.find((org) => org.id === session.activeOrganizationId)?.permissions ?? [];
  if (loading || error)
    return (
      <ResourceNotice loading={loading} error={error} onRetry={() => window.location.reload()} />
    );
  if (!plugin || !page || !entity)
    return (
      <Notice tone="error">
        {fr
          ? 'Cette extension est indisponible dans l’organisation active.'
          : 'This extension is unavailable in the active organization.'}
      </Notice>
    );
  if (!permissions.includes(entity.read))
    return (
      <Notice tone="error">
        {fr
          ? 'Vous n’avez pas accès à cette ressource.'
          : 'You do not have access to this resource.'}
      </Notice>
    );
  return (
    <PluginEntity
      key={`${session.activeOrganizationId}:${id}:${page.key}`}
      id={plugin.id}
      page={page}
      entity={entity}
      writable={permissions.includes(entity.write)}
      locale={locale}
    />
  );
}
function PluginEntity({
  id,
  page,
  entity,
  writable,
  locale,
}: {
  id: string;
  page: PluginManifest['frontend']['pages'][number];
  entity: PluginManifest['module']['entities'][number];
  writable: boolean;
  locale: 'fr' | 'en';
}) {
  const fr = locale === 'fr',
    { post } = usePlatform(),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<ModuleEntry | null>(null),
    [remove, setRemove] = useState<ModuleEntry | null>(null);
  const path = `modules/${id}/data/${entity.entity}`;
  const resource = usePlatformResource<{ entries: ModuleEntry[] }>(path, revision);
  const refresh = () => setRevision((value) => value + 1);
  return (
    <>
      <PlatformHeading title={page.title[locale]} />
      <section className="platform-panel plugin-entity">
        <h2>
          <AppIcon name={page.icon} size={22} /> {page.title[locale]}
        </h2>
        <ResourceNotice loading={resource.loading} error={resource.error} onRetry={refresh} />
        {resource.data?.entries.length === 0 && (
          <p>{fr ? 'Aucune entrée pour le moment.' : 'No entries yet.'}</p>
        )}
        {resource.data && resource.data.entries.length > 0 && (
          <div className="table-scroll" role="region" tabIndex={0} aria-label={page.title[locale]}>
            <table>
              <thead>
                <tr>
                  {entity.fields.map((f) => (
                    <th key={f.name}>{f.label?.[locale] ?? f.name}</th>
                  ))}
                  {writable && <th>{fr ? 'Actions' : 'Actions'}</th>}
                </tr>
              </thead>
              <tbody>
                {resource.data.entries.map((entry) => (
                  <tr key={entry.id}>
                    {entity.fields.map((f) => (
                      <td key={f.name}>{entry.values[f.name] || '—'}</td>
                    ))}
                    {writable && (
                      <td>
                        <div className="row-actions">
                          <Button
                            variant="text"
                            onClick={() => {
                              setSelected(entry);
                              setRemove(null);
                            }}
                          >
                            {fr ? 'Modifier' : 'Edit'}
                          </Button>
                          <Button
                            variant="text"
                            onClick={() => {
                              setRemove(entry);
                              setSelected(null);
                            }}
                          >
                            {fr ? 'Supprimer' : 'Delete'}
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {remove && (
        <section className="platform-panel">
          <TaskForm
            title={fr ? 'Confirmer la suppression' : 'Confirm deletion'}
            submit={fr ? 'Supprimer cette entrée' : 'Delete this entry'}
            onSave={async () => {
              await post(`${path}/${remove.id}/delete`, {});
              setRemove(null);
              refresh();
            }}
          >
            <p>{Object.values(remove.values)[0]}</p>
            <label className="checkbox-label">
              <input required type="checkbox" />
              {fr
                ? 'Je confirme la suppression de cette entrée.'
                : 'I confirm deletion of this entry.'}
            </label>
            <Button variant="text" onClick={() => setRemove(null)}>
              {fr ? 'Annuler' : 'Cancel'}
            </Button>
          </TaskForm>
        </section>
      )}
      {writable && (
        <section className="platform-panel">
          <TaskForm
            key={selected?.id ?? 'new'}
            title={
              selected
                ? fr
                  ? 'Modifier l’entrée'
                  : 'Edit entry'
                : fr
                  ? 'Ajouter une entrée'
                  : 'Add an entry'
            }
            submit={fr ? 'Enregistrer' : 'Save'}
            reset={!selected}
            onSave={async (form) => {
              const values = Object.fromEntries(
                entity.fields.map((field) => [field.name, String(form.get(field.name) ?? '')]),
              );
              await post(selected ? `${path}/${selected.id}` : path, values);
              setSelected(null);
              refresh();
            }}
          >
            {entity.fields.map((field) => (
              <Field
                key={field.name}
                label={field.label?.[locale] ?? field.name}
                name={field.name}
                required={field.required}
                maxLength={field.max}
                {...(selected ? { value: selected.values[field.name] ?? '' } : {})}
              />
            ))}
            {selected && (
              <Button variant="text" onClick={() => setSelected(null)}>
                {fr ? 'Annuler la modification' : 'Cancel editing'}
              </Button>
            )}
          </TaskForm>
        </section>
      )}
    </>
  );
}
