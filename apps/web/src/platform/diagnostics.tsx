import { useState } from 'react';
import { Button } from '@orkobi/sdk-ui';
import { usePreferences } from '../preferences-context';
import { usePlatformResource } from './hooks';
import { ResourceNotice } from './components';
interface Runtime {
  database: {
    engine: string;
    transactionalDdl: boolean;
    nativeArrays: boolean;
    nativeJson: boolean;
    supportedVersion: string;
  };
  system: {
    sampledAt: string;
    uptimeSeconds: number;
    memory: { rssBytes: number; heapUsedBytes: number };
    eventLoop: { p99Ms: number };
    http: { requests: number; serverErrors: number; meanDurationMs: number };
  };
  jobs: { enabled: boolean; completed: number; failed: number };
  cache: { mode: string };
}
export function DiagnosticsPanel() {
  const { locale } = usePreferences(),
    fr = locale === 'fr';
  const [revision, setRevision] = useState(0);
  const resource = usePlatformResource<Runtime>('admin/runtime', revision);
  const refresh = () => setRevision((v) => v + 1);
  const data = resource.data,
    number = (value: number) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const rows = data
    ? [
        [
          fr ? 'Moteur SQL' : 'SQL engine',
          `${data.database.engine} · ${data.database.supportedVersion}`,
        ],
        [
          fr ? 'Durée du processus' : 'Process uptime',
          `${number(data.system.uptimeSeconds / 60)} min`,
        ],
        [
          fr ? 'Mémoire résidente' : 'Resident memory',
          `${number(data.system.memory.rssBytes / 1048576)} MiB`,
        ],
        [
          fr ? 'Mémoire JavaScript utilisée' : 'JavaScript heap used',
          `${number(data.system.memory.heapUsedBytes / 1048576)} MiB`,
        ],
        [
          fr ? 'Retard de boucle p99' : 'Event loop delay p99',
          `${number(data.system.eventLoop.p99Ms)} ms`,
        ],
        [
          fr ? 'Requêtes HTTP / erreurs serveur' : 'HTTP requests / server errors',
          `${number(data.system.http.requests)} / ${number(data.system.http.serverErrors)}`,
        ],
        [
          fr ? 'Durée HTTP moyenne' : 'Mean HTTP duration',
          `${number(data.system.http.meanDurationMs)} ms`,
        ],
        [
          fr ? 'Planificateur' : 'Scheduler',
          data.jobs.enabled ? (fr ? 'En marche' : 'Running') : fr ? 'Arrêté' : 'Stopped',
        ],
        ['Cache', data.cache.mode],
      ]
    : [];
  return (
    <section
      className="platform-panel diagnostic-panel"
      aria-label={fr ? 'Diagnostic administrateur' : 'Administrator diagnostics'}
    >
      <div className="page-heading">
        <h2>{fr ? 'Diagnostic administrateur' : 'Administrator diagnostics'}</h2>
        <Button variant="secondary" onClick={refresh} disabled={resource.loading}>
          {fr ? 'Actualiser le diagnostic' : 'Refresh diagnostics'}
        </Button>
      </div>
      <p>
        {fr
          ? 'Mesures du processus Core courant, depuis son démarrage.'
          : 'Measurements from the current Core process since startup.'}
      </p>
      <ResourceNotice loading={resource.loading} error={resource.error} onRetry={refresh} />
      {data && (
        <>
          <dl className="diagnostic-values">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p>
            {data.database.transactionalDdl
              ? fr
                ? 'Migrations DDL transactionnelles.'
                : 'Transactional DDL migrations.'
              : fr
                ? 'DDL non transactionnel : un lot partiel bloque les migrations et nécessite une réparation explicite.'
                : 'Nontransactional DDL: a partial batch blocks migrations and requires explicit repair.'}
          </p>
          <p>
            {fr
              ? 'Isolation des organisations contrôlée par le Core.'
              : 'Organization isolation enforced by the Core.'}{' '}
            {!data.database.nativeArrays &&
              (fr ? 'Tableaux SQL natifs indisponibles.' : 'Native SQL arrays unavailable.')}{' '}
            {!data.database.nativeJson &&
              (fr ? 'JSON conservé en texte validé.' : 'JSON stored as validated text.')}
          </p>
          <small>
            {fr ? 'Mesuré à' : 'Sampled at'}{' '}
            {new Date(data.system.sampledAt).toLocaleString(locale)}
          </small>
        </>
      )}
    </section>
  );
}
