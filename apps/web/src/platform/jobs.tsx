import { useState } from 'react';
import { Button, Field, Notice } from '@orkobi/sdk-ui';
import type { JobSummary, ModuleSummary } from '@orkobi/contracts';
import { usePreferences } from '../preferences-context';
import { usePlatform } from './context';
import { usePlatformResource } from './hooks';
import { PageHeading, ResourceNotice, TaskForm } from './components';
import { DataTable, Th } from '@orkobi/sdk-ui';

export function JobsPage() {
  const { locale } = usePreferences(),
    fr = locale === 'fr',
    { session, post } = usePlatform();
  const [revision, setRevision] = useState(0);
  const org = session.organizations.find((org) => org.id === session.activeOrganizationId);
  const resource = usePlatformResource<{ jobs: JobSummary[]; enabled: boolean }>(
    org ? 'jobs' : null,
    revision,
  );
  const modules = usePlatformResource<{ modules: ModuleSummary[] }>(
    org ? 'modules' : null,
    revision,
  );
  const refresh = () => setRevision((value) => value + 1);
  const demo = modules.data?.modules.some((module) => module.id === 'orkobi.demo' && module.active);
  const canSchedule =
    demo && org?.permissions.includes('modules:write') && org.permissions.includes('demo:read');
  const statuses = {
    pending: fr ? 'En attente' : 'Pending',
    running: fr ? 'En cours' : 'Running',
    succeeded: fr ? 'Terminée' : 'Succeeded',
    failed: fr ? 'Échec' : 'Failed',
    suspended: fr ? 'Suspendue' : 'Suspended',
    cancelled: fr ? 'Annulée' : 'Cancelled',
  };
  return (
    <>
      <PageHeading
        title={fr ? 'Tâches planifiées' : 'Scheduled tasks'}
        description={
          fr
            ? 'Vos tâches dans l’organisation active, avec leur état et leur prochaine exécution.'
            : 'Your tasks in the active organization, with their status and next execution.'
        }
      />
      {!org ? (
        <Notice>
          {fr
            ? 'Sélectionnez une organisation pour consulter ses tâches.'
            : 'Select an organization to view its tasks.'}
        </Notice>
      ) : (
        <>
          <section className="platform-panel">
            <div className="page-heading">
              <h2>{org.name}</h2>
              <Button variant="secondary" onClick={refresh} disabled={resource.loading}>
                {fr ? 'Actualiser' : 'Refresh'}
              </Button>
            </div>
            <ResourceNotice loading={resource.loading} error={resource.error} onRetry={refresh} />
            {resource.data?.enabled === false && (
              <Notice>
                {fr
                  ? 'Le planificateur est arrêté. Les tâches restent enregistrées.'
                  : 'The scheduler is stopped. Tasks remain stored.'}
              </Notice>
            )}
            {resource.data?.jobs.length === 0 && (
              <p>{fr ? 'Aucune tâche pour le moment.' : 'No tasks yet.'}</p>
            )}
            {resource.data && resource.data.jobs.length > 0 && (
              <DataTable label={fr ? 'Liste des tâches' : 'Task list'}>
                <thead>
                  <tr>
                    {(fr
                      ? ['Tâche', 'État', 'Prochaine exécution', 'Tentatives', 'Actions']
                      : ['Task', 'Status', 'Next execution', 'Attempts', 'Actions']
                    ).map((title) => (
                      <Th key={title}>{title}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resource.data.jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        {job.task === 'verify_notes'
                          ? fr
                            ? 'Vérification des notes'
                            : 'Note verification'
                          : job.task}
                        <small className="job-module">
                          {job.moduleId}
                          {job.intervalSeconds ? ` · ${job.intervalSeconds}s` : ''}
                        </small>
                      </td>
                      <td>
                        {statuses[job.status]}
                        {job.lastError && (
                          <small className="job-module">
                            {job.lastError === 'timeout'
                              ? fr
                                ? 'Délai dépassé'
                                : 'Timed out'
                              : job.lastError === 'module_disabled'
                                ? fr
                                  ? 'Module désactivé'
                                  : 'Module disabled'
                                : job.lastError}
                          </small>
                        )}
                      </td>
                      <td>
                        <time dateTime={new Date(job.runAt).toISOString()}>
                          {new Date(job.runAt).toLocaleString(locale)}
                        </time>
                      </td>
                      <td>{job.attempts}</td>
                      <td>
                        {org.permissions.includes('modules:write') &&
                          ['pending', 'running', 'suspended', 'failed'].includes(job.status) && (
                            <TaskForm
                              submit={
                                ['failed', 'suspended'].includes(job.status)
                                  ? fr
                                    ? 'Relancer'
                                    : 'Retry'
                                  : fr
                                    ? 'Annuler'
                                    : 'Cancel'
                              }
                              onSave={async () => {
                                await post(
                                  `jobs/${job.id}/${['failed', 'suspended'].includes(job.status) ? 'retry' : 'cancel'}`,
                                  {},
                                );
                                refresh();
                              }}
                            >
                              <span className="sr-only">{job.task}</span>
                            </TaskForm>
                          )}
                        {org.permissions.includes('modules:write') &&
                          job.status === 'suspended' && (
                            <TaskForm
                              submit={fr ? 'Annuler' : 'Cancel'}
                              onSave={async () => {
                                await post(`jobs/${job.id}/cancel`, {});
                                refresh();
                              }}
                            >
                              <span className="sr-only">{job.task}</span>
                            </TaskForm>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </section>
          {canSchedule && (
            <section className="platform-panel">
              <TaskForm
                title={fr ? 'Vérifier les notes de démonstration' : 'Verify demo notes'}
                submit={fr ? 'Planifier la tâche' : 'Schedule task'}
                onSave={async (data) => {
                  const runAt = String(data.get('runAt') ?? '');
                  const interval = Number(data.get('intervalSeconds'));
                  await post('jobs', {
                    moduleId: 'orkobi.demo',
                    task: 'verify_notes',
                    ...(runAt ? { runAt: new Date(runAt).toISOString() } : {}),
                    ...(interval ? { intervalSeconds: interval } : {}),
                  });
                  refresh();
                }}
              >
                <p>
                  {fr
                    ? 'Cette tâche vérifie la lecture des notes sans les modifier. Laissez la date vide pour un lancement dès que possible.'
                    : 'This task verifies note access. Leave the date empty to run as soon as possible.'}
                </p>
                <Field
                  label={fr ? 'Date de début (heure locale)' : 'Start date (local time)'}
                  name="runAt"
                  type="datetime-local"
                  required={false}
                />
                <label className="platform-field">
                  <span>{fr ? 'Répétition' : 'Repeat'}</span>
                  <select name="intervalSeconds">
                    <option value="0">{fr ? 'Une seule fois' : 'Once'}</option>
                    <option value="3600">{fr ? 'Toutes les heures' : 'Every hour'}</option>
                    <option value="86400">{fr ? 'Tous les jours' : 'Every day'}</option>
                  </select>
                </label>
              </TaskForm>
            </section>
          )}
        </>
      )}
    </>
  );
}
