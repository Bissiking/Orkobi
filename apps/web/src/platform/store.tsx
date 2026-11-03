import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button, Notice, AppIcon } from '@orkobi/sdk-ui';
import type { StoreReview, StoreRepositorySummary } from '@orkobi/contracts';
import { usePreferences } from '../preferences-context';
import { usePlatform } from './context';
import { usePlatformResource } from './hooks';
import { ResourceNotice, TaskForm } from './components';
export function StoreAdmin() {
  const { locale } = usePreferences(),
    fr = locale === 'fr',
    { post } = usePlatform();
  const [params, setParams] = useSearchParams(),
    [revision, setRevision] = useState(0),
    [reviewed, setReviewed] = useState<{ selection: string; value: StoreReview } | null>(null),
    [success, setSuccess] = useState(false),
    [search, setSearch] = useState('');
  const resource = usePlatformResource<{ repositories: StoreRepositorySummary[] }>(
    'admin/store',
    revision,
  );
  const repositories = resource.data?.repositories ?? [],
    repository =
      repositories.find((repo) => repo.id === params.get('repository')) ?? repositories[0];
  const selection = `${repository?.id}/${params.get('plugin')}/${params.get('version')}`;
  const review = reviewed?.selection === selection ? reviewed.value : null;
  const refresh = () => {
    setReviewed(null);
    setRevision((value) => value + 1);
  };
  const channel = (value: string) =>
    value === 'official'
      ? fr
        ? 'Officiel'
        : 'Official'
      : value === 'private'
        ? fr
          ? 'Privé'
          : 'Private'
        : fr
          ? 'Communautaire'
          : 'Community';
  const reason = (key: string) =>
    ({
      core: fr ? 'Version du Core incompatible' : 'Incompatible Core version',
      sdk: fr ? 'Version du SDK incompatible' : 'Incompatible SDK version',
      sql: fr ? 'Moteur SQL incompatible' : 'Incompatible SQL engine',
      version: fr ? 'Version déjà installée ou antérieure' : 'Version already installed or older',
    })[key] ??
    (key.startsWith('capability:')
      ? fr
        ? 'Capacité requise absente : '
        : 'Missing required capability: '
      : fr
        ? 'Dépendance incompatible : '
        : 'Incompatible dependency: ') + key.split(':').slice(1).join(':');
  const releases =
    repository?.releases.filter((release) =>
      `${release.name} ${release.id}`
        .toLocaleLowerCase(locale)
        .includes(search.toLocaleLowerCase(locale)),
    ) ?? [];
  return (
    <>
      <section className="platform-panel">
        <div className="page-heading">
          <div>
            <h2>Orkobi Store</h2>
            <p>
              {fr
                ? 'Parcourez les versions disponibles et vérifiez chaque extension avant de l’installer.'
                : 'Browse available versions and review each extension before installing.'}
            </p>
          </div>
          <Button variant="secondary" onClick={refresh} disabled={resource.loading}>
            {fr ? 'Actualiser le catalogue' : 'Refresh catalog'}
          </Button>
        </div>
        <ResourceNotice loading={resource.loading} error={resource.error} onRetry={refresh} />
        {success && (
          <Notice tone="success">
            {fr
              ? 'Extension installée et désactivée. Vous pouvez maintenant choisir ses droits et ses organisations.'
              : 'Extension installed and disabled. You can now choose its permissions and organizations.'}{' '}
            <Button variant="text" to="/admin?tab=plugins">
              {fr ? 'Gérer les extensions' : 'Manage extensions'}
            </Button>
          </Notice>
        )}
        {resource.data && repositories.length === 0 && (
          <Notice>
            {fr
              ? 'Aucun dépôt de confiance n’est configuré pour cette instance. L’installation depuis un fichier reste disponible dans Extensions.'
              : 'No trusted repository is configured for this instance. File installation remains available under Extensions.'}
          </Notice>
        )}
        {repositories.length > 0 && (
          <div className="form-columns">
            <label className="platform-field">
              <span>{fr ? 'Dépôt' : 'Repository'}</span>
              <select
                value={repository?.id ?? ''}
                onChange={(event) => {
                  setReviewed(null);
                  setSuccess(false);
                  setParams({ tab: 'store', repository: event.target.value });
                }}
              >
                {repositories.map((repo) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.name} · {channel(repo.channel)}
                  </option>
                ))}
              </select>
            </label>
            <label className="platform-field">
              <span>{fr ? 'Rechercher une extension' : 'Find an extension'}</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                maxLength={120}
              />
            </label>
          </div>
        )}
        {repository?.state === 'unavailable' && (
          <Notice tone="error">
            {fr
              ? 'Ce dépôt ne répond pas. Les extensions installées continuent à fonctionner. Réessayez en actualisant le catalogue.'
              : 'This repository is unavailable. Installed extensions continue to work. Refresh the catalog to retry.'}
          </Notice>
        )}
        {repository?.state === 'untrusted' && (
          <Notice tone="error">
            {fr
              ? 'Ce catalogue n’a pas pu être vérifié. Son installation est bloquée ; faites vérifier la configuration du dépôt.'
              : 'This catalog could not be verified. Installation is blocked; have the repository configuration checked.'}
          </Notice>
        )}
        {repository?.state === 'ready' && (
          <>
            <p>
              {channel(repository.channel)} ·{' '}
              {fr ? 'Signature du dépôt vérifiée' : 'Repository signature verified'}
            </p>
            {releases.length === 0 ? (
              <p>
                {fr
                  ? 'Aucune version ne correspond à votre recherche.'
                  : 'No versions match your search.'}
              </p>
            ) : (
              <div
                className="table-scroll"
                role="region"
                aria-label={fr ? 'Versions du Store' : 'Store versions'}
                tabIndex={0}
              >
                <table className="store-catalog">
                  <thead>
                    <tr>
                      {(fr
                        ? ['Extension', 'Version', 'Compatibilité', 'Installation', 'Action']
                        : ['Extension', 'Version', 'Compatibility', 'Installation', 'Action']
                      ).map((label) => (
                        <th key={label}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {releases.map((release) => (
                      <tr key={`${release.id}@${release.version}`}>
                        <td>
                          <div className="store-extension">
                            <AppIcon name={release.icon} size={24} />
                            <div>
                              <strong>{release.name}</strong>
                              <small className="job-module">{release.id}</small>
                              <p>{release.description}</p>
                            </div>
                          </div>
                        </td>
                        <td data-label={fr ? 'Version' : 'Version'}>{release.version}</td>
                        <td data-label={fr ? 'Compatibilité' : 'Compatibility'}>
                          {release.compatible
                            ? fr
                              ? 'Compatible'
                              : 'Compatible'
                            : release.reasons.map(reason).join(' · ')}
                        </td>
                        <td data-label={fr ? 'Installation' : 'Installation'}>
                          {release.installedVersion
                            ? release.update
                              ? fr
                                ? 'Mise à jour disponible'
                                : 'Update available'
                              : (fr ? 'Installée : ' : 'Installed: ') + release.installedVersion
                            : fr
                              ? 'Non installée'
                              : 'Not installed'}
                        </td>
                        <td>
                          <TaskForm
                            submit={fr ? 'Examiner' : 'Review'}
                            onSave={async () => {
                              const key = `${repository.id}/${release.id}/${release.version}`;
                              setParams({
                                tab: 'store',
                                repository: repository.id,
                                plugin: release.id,
                                version: release.version,
                              });
                              setSuccess(false);
                              const value = await post<StoreReview>('admin/store/review', {
                                repositoryId: repository.id,
                                id: release.id,
                                version: release.version,
                                digest: release.digest,
                              });
                              setReviewed({ selection: key, value });
                              return false;
                            }}
                          >
                            <span className="sr-only">
                              {release.name} {release.version}
                            </span>
                          </TaskForm>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      {review && (
        <section
          className="platform-panel store-review"
          aria-label={fr ? 'Revue de l’extension' : 'Extension review'}
        >
          <h2>
            {review.release.manifest.module.name} · {review.release.manifest.module.version}
          </h2>
          <p>{review.release.manifest.module.description}</p>
          <dl className="plugin-review">
            <dt>{fr ? 'Source vérifiée' : 'Verified source'}</dt>
            <dd>
              {review.repository.name} · {channel(review.repository.channel)}
            </dd>
            <dt>{fr ? 'Clé de signature' : 'Signing key'}</dt>
            <dd>
              <code>{review.repository.keyId}</code>
            </dd>
            <dt>{fr ? 'Empreinte du paquet' : 'Package digest'}</dt>
            <dd>
              <code>{review.release.digest}</code>
            </dd>
            <dt>{fr ? 'Moteurs pris en charge' : 'Supported engines'}</dt>
            <dd>{review.release.sqlEngines.join(', ')}</dd>
            <dt>{fr ? 'Version précédente' : 'Previous version'}</dt>
            <dd>{review.previousVersion ?? '—'}</dd>
            <dt>{fr ? 'Provenance précédente' : 'Previous source'}</dt>
            <dd>
              {review.previousOrigin?.verified
                ? review.previousOrigin.repositoryId
                : fr
                  ? 'Installation locale non certifiée'
                  : 'Unverified local installation'}
            </dd>
          </dl>
          <h3>{fr ? 'Permissions demandées' : 'Requested permissions'}</h3>
          <ul>
            {review.release.manifest.module.permissions.map((permission) => (
              <li key={permission.key}>
                <code>{permission.key}</code> — {permission.description}{' '}
                {review.newPermissions.includes(permission.key) && (
                  <strong>({fr ? 'Nouveau droit' : 'New permission'})</strong>
                )}
              </li>
            ))}
          </ul>
          <h3>{fr ? 'Tables logiques et champs' : 'Logical tables and fields'}</h3>
          <ul>
            {review.release.manifest.module.entities.map((entity) => (
              <li key={entity.entity}>
                <code>{entity.table}</code> :{' '}
                {entity.fields.map((field) => field.label?.[locale] ?? field.name).join(', ')}
              </li>
            ))}
          </ul>
          <h3>{fr ? 'Dépendances et exigences' : 'Dependencies and requirements'}</h3>
          <ul>
            {Object.entries(review.release.manifest.dependencyVersions).map(([id, range]) => (
              <li key={id}>
                {id} : {range}
              </li>
            ))}
            {review.release.manifest.module.capabilities.map((capability) => (
              <li key={capability.key}>
                {capability.key} ·{' '}
                {capability.required
                  ? fr
                    ? 'Obligatoire'
                    : 'Required'
                  : fr
                    ? 'Facultative'
                    : 'Optional'}
              </li>
            ))}
          </ul>
          {review.reasons.length > 0 && (
            <Notice tone="error">{review.reasons.map(reason).join(' · ')}</Notice>
          )}
          {review.requiresDeactivation && (
            <Notice>
              {fr
                ? 'Désactivez cette extension sur la plateforme et dans ses organisations avant de la mettre à jour.'
                : 'Disable this extension on the platform and in its organizations before updating.'}{' '}
              <Button variant="text" to="/admin?tab=plugins">
                {fr ? 'Gérer les extensions' : 'Manage extensions'}
              </Button>
            </Notice>
          )}
          <TaskForm
            key={review.reviewId}
            submit={
              review.previousVersion
                ? fr
                  ? 'Mettre à jour désactivée'
                  : 'Update disabled'
                : fr
                  ? 'Installer désactivée'
                  : 'Install disabled'
            }
            disabled={review.reasons.length > 0 || review.requiresDeactivation}
            onSave={async (form) => {
              await post('admin/store/install', {
                reviewId: review.reviewId,
                confirmId: review.release.manifest.module.id,
                digest: review.release.digest,
                expectedPreviousDigest: review.previousDigest,
                acknowledgeSource: form.get('source') === 'on',
                acknowledgeNewPermissions: form.get('permissions') === 'on',
              });
              setReviewed(null);
              setSuccess(true);
              setRevision((value) => value + 1);
            }}
          >
            <label className="checkbox-label">
              <input name="source" type="checkbox" required />
              {fr
                ? 'J’ai vérifié le dépôt signé, le paquet et ses ressources.'
                : 'I have reviewed the signed repository, package and resources.'}
            </label>
            {review.newPermissions.length > 0 && (
              <label className="checkbox-label">
                <input name="permissions" type="checkbox" required />
                {fr
                  ? 'J’accepte l’ajout des permissions déclarées. Je les accorderai séparément aux rôles concernés.'
                  : 'I accept the new permission declarations. I will grant them separately to the relevant roles.'}
              </label>
            )}
            <Notice>
              {fr
                ? 'Aucun nouveau droit n’est accordé automatiquement. La revue expire après cinq minutes ; réexaminez le paquet si nécessaire.'
                : 'No new permissions are granted automatically. The review expires after five minutes; review the package again if needed.'}
            </Notice>
          </TaskForm>
        </section>
      )}
    </>
  );
}
