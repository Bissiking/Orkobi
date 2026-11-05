import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button, AppIcon, Notice } from '@orkobi/sdk-ui';
import { ArrowRight, RotateCw } from 'lucide-react';
import type { ModuleSummary } from '@orkobi/contracts';
import { usePreferences } from '../preferences-context';
import { usePlatform } from './context';
import { usePlatformResource } from './hooks';
import { useBusinessCatalog } from './business/catalog-context';
import { TaskForm, ResourceNotice } from './components';
import { useConfirm } from './confirm-context';
import { SearchField, StatusPill, EmptyState } from '@orkobi/sdk-ui';
import { normalizeSearch, moduleDescriptions } from './business/presentation';
export function ModulesSection({ compact = false }: { compact?: boolean }) {
  const { locale } = usePreferences(),
    fr = locale === 'fr',
    { session, post } = usePlatform(),
    confirm = useConfirm(),
    [revision, setRevision] = useState(0),
    [params, setParams] = useSearchParams();
  const organization = session.organizations.find((org) => org.id === session.activeOrganizationId),
    permissions = organization?.permissions ?? [];
  const modules = usePlatformResource<{ modules: ModuleSummary[] }>(
      session.user && organization && permissions.includes('modules:read') ? 'modules' : null,
      revision,
    ),
    catalog = useBusinessCatalog();
  const query = compact ? '' : (params.get('q') ?? ''),
    showAll = compact ? false : params.get('show') !== 'active';
  const title = (module: ModuleSummary) => {
    const d = catalog.data?.definitions.find((d) => d.manifest.id === module.id);
    return d ? d.label[locale] : module.name;
  };
  const description = (module: ModuleSummary) => {
    const definition = catalog.data?.definitions.find((d) => d.manifest.id === module.id);
    return definition ? moduleDescriptions[definition.key][locale] : module.description;
  };
  const canOpen = (module: ModuleSummary) =>
    module.active &&
    (module.id === 'orkobi.demo'
      ? permissions.includes('demo:read')
      : !module.id.startsWith('orkobi.') || permissions.includes(`${module.id}:read`));
  const activeIds = new Set(
    (modules.data?.modules ?? []).filter((module) => module.active).map((module) => module.id),
  );
  const dependents = (id: string) =>
    (catalog.data?.definitions ?? [])
      .filter(
        (definition) =>
          activeIds.has(definition.manifest.id) && definition.manifest.dependencies.includes(id),
      )
      .map((definition) => definition.label[locale]);
  const matching = (modules.data?.modules ?? []).filter(
    (module) =>
      (showAll || module.active) &&
      normalizeSearch(`${title(module)} ${description(module)}`).includes(normalizeSearch(query)),
  );
  const groups = compact
    ? [{ name: fr ? 'Vos modules actifs' : 'Your active modules', rows: matching.filter(canOpen) }]
    : [
        {
          name: fr ? 'Modules actifs' : 'Active modules',
          rows: matching.filter((module) => module.active),
        },
        {
          name: fr ? 'Autres modules' : 'Other modules',
          rows: matching.filter((module) => !module.active),
        },
      ];
  return (
    <section
      className={`module-directory${compact ? ' module-directory-compact' : ''}`}
      aria-busy={modules.loading || catalog.loading}
    >
      <div className="business-section-heading">
        <div>
          {compact ? (
            <h2>{fr ? 'Votre espace de travail' : 'Your workspace'}</h2>
          ) : (
            <h1>{fr ? 'Modules de l’organisation' : 'Organization modules'}</h1>
          )}
          <p>
            {organization?.name ??
              (fr
                ? 'Sélectionnez une organisation pour retrouver vos outils.'
                : 'Select an organization to find your tools.')}
          </p>
        </div>
        {compact ? (
          <Button variant="secondary" to="/modules">
            {fr ? 'Tous les modules' : 'All modules'}
            <ArrowRight size={16} />
          </Button>
        ) : (
          <Button
            variant="icon"
            aria-label={fr ? 'Actualiser les modules' : 'Refresh modules'}
            disabled={modules.loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RotateCw size={18} />
          </Button>
        )}
      </div>
      {!session.user && (
        <Notice>
          {fr ? 'Connectez-vous pour utiliser les modules.' : 'Sign in to use modules.'}
        </Notice>
      )}
      {session.user && !organization && (
        <Notice>
          {fr
            ? 'Choisissez une organisation dans la barre supérieure.'
            : 'Choose an organization in the top bar.'}
        </Notice>
      )}
      <ResourceNotice
        loading={modules.loading || catalog.loading}
        error={modules.error || catalog.error}
        onRetry={() => {
          catalog.refresh();
          setRevision((value) => value + 1);
        }}
      />
      {!compact && organization && (
        <div className="business-list-tools">
          <SearchField
            className="business-search"
            label={fr ? 'Rechercher un module' : 'Search modules'}
            value={query}
            placeholder={fr ? 'Rechercher un module…' : 'Search modules…'}
            onChange={(value) => {
              const next = new URLSearchParams(params);
              if (value) next.set('q', value);
              else next.delete('q');
              setParams(next, { replace: true });
            }}
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!showAll}
              onChange={(event) => {
                const next = new URLSearchParams(params);
                if (event.target.checked) next.set('show', 'active');
                else next.delete('show');
                setParams(next);
              }}
            />
            {fr ? 'Actifs uniquement' : 'Active only'}
          </label>
        </div>
      )}
      {organization && !permissions.includes('modules:read') && catalog.data && (
        <section className="module-directory-group">
          <h2>{fr ? 'Modules autorisés' : 'Authorized modules'}</h2>
          <p>
            {fr
              ? 'La disponibilité est vérifiée à l’ouverture de chaque module.'
              : 'Availability is checked when you open each module.'}
          </p>
          <ul>
            {catalog.data.definitions
              .filter((definition) => permissions.includes(`${definition.manifest.id}:read`))
              .map((definition) => (
                <li key={definition.key}>
                  <AppIcon name={definition.icon} size={22} />
                  <div className="module-directory-description">
                    <h3>{definition.label[locale]}</h3>
                    <p>{moduleDescriptions[definition.key][locale]}</p>
                  </div>
                  <Button variant="primary" to={`/business/${definition.key}`}>
                    {fr ? 'Ouvrir' : 'Open'}
                  </Button>
                </li>
              ))}
          </ul>
          {!catalog.data.definitions.some((definition) =>
            permissions.includes(`${definition.manifest.id}:read`),
          ) && (
            <p>
              {fr
                ? 'Aucun droit métier n’a encore été attribué. Contactez un administrateur.'
                : 'No business permissions have been granted yet. Contact an administrator.'}
            </p>
          )}
        </section>
      )}
      {groups.map(
        (group) =>
          group.rows.length > 0 && (
            <section className="module-directory-group" key={group.name}>
              <h2>
                {group.name}
                <span>{group.rows.length}</span>
              </h2>
              <ul>
                {group.rows.map((module) => {
                  const definition = catalog.data?.definitions.find(
                      (d) => d.manifest.id === module.id,
                    ),
                    open = canOpen(module),
                    destination =
                      module.id === 'orkobi.demo'
                        ? '/modules/demo'
                        : module.id.startsWith('orkobi.')
                          ? `/business/${module.id.slice(7)}`
                          : `/plugins/${module.id}`;
                  return (
                    <li key={module.id}>
                      <span className="module-directory-icon">
                        <AppIcon name={definition?.icon ?? 'notes'} size={24} />
                      </span>
                      <div className="module-directory-description">
                        <h3>{title(module)}</h3>
                        <p>{description(module)}</p>
                        {module.active && dependents(module.id).length > 0 && (
                          <p className="module-dependency-note">
                            {fr ? 'Désactiver d’abord : ' : 'Deactivate first: '}
                            {dependents(module.id).join(', ')}
                          </p>
                        )}
                        {module.unsatisfiedDependencies.length > 0 && (
                          <p className="module-dependency-note">
                            {fr ? 'À activer d’abord : ' : 'Enable first: '}
                            {module.unsatisfiedDependencies
                              .map((id) => {
                                const found = modules.data?.modules.find((m) => m.id === id);
                                return found ? title(found) : id;
                              })
                              .join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="module-directory-actions">
                        <StatusPill tone={module.active ? 'positive' : 'muted'}>
                          {module.active
                            ? fr
                              ? 'Actif'
                              : 'Active'
                            : module.enabled
                              ? fr
                                ? 'À activer'
                                : 'Not active'
                              : fr
                                ? 'Plateforme désactivée'
                                : 'Disabled on platform'}
                        </StatusPill>
                        {open ? (
                          <Button variant="primary" to={destination}>
                            {fr ? 'Ouvrir' : 'Open'}
                            <ArrowRight size={15} />
                          </Button>
                        ) : module.active ? (
                          <span className="module-access-note">
                            {fr ? 'Consultation à accorder' : 'Read permission required'}
                          </span>
                        ) : null}
                        {!compact && permissions.includes('modules:write') && module.enabled && (
                          <TaskForm
                            submit={
                              module.active
                                ? fr
                                  ? 'Désactiver'
                                  : 'Deactivate'
                                : fr
                                  ? 'Activer'
                                  : 'Activate'
                            }
                            submitVariant="secondary"
                            disabled={
                              (module.active && dependents(module.id).length > 0) ||
                              (!module.active &&
                                (module.unsatisfiedDependencies.length > 0 ||
                                  module.missingCapabilities.length > 0))
                            }
                            onSave={async () => {
                              if (
                                module.active &&
                                !(await confirm(
                                  fr
                                    ? `Désactiver « ${title(module)} » pour cette organisation ?`
                                    : `Deactivate “${title(module)}” for this organization?`,
                                  { danger: true },
                                ))
                              )
                                return false;
                              await post(
                                `modules/${module.id}/${module.active ? 'deactivate' : 'activate'}`,
                                {},
                              );
                              setRevision((value) => value + 1);
                            }}
                          >
                            <span className="sr-only">{title(module)}</span>
                          </TaskForm>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
      )}
      {modules.data && !modules.loading && groups.every((group) => !group.rows.length) && (
        <EmptyState
          className="business-empty"
          title={
            query
              ? fr
                ? 'Aucun module ne correspond'
                : 'No matching modules'
              : fr
                ? 'Aucun module accessible pour le moment'
                : 'No modules available yet'
          }
          description={
            query
              ? fr
                ? 'Essayez un autre nom ou retirez le filtre des modules actifs.'
                : 'Try another name or remove the active modules filter.'
              : fr
                ? 'Un administrateur doit activer les modules et vous attribuer leurs droits de consultation.'
                : 'An administrator must activate modules and grant you read access.'
          }
        >
          {query && (
            <Button variant="secondary" onClick={() => setParams({})}>
              {fr ? 'Réinitialiser les filtres' : 'Reset filters'}
            </Button>
          )}
          {session.user?.platformAdmin && (
            <Button variant="secondary" to="/admin?tab=business">
              {fr ? 'Configurer les accès' : 'Configure access'}
            </Button>
          )}
        </EmptyState>
      )}
    </section>
  );
}
