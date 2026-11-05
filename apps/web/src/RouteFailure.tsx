import { Button } from '@orkobi/sdk-ui';
import { usePlatformCopy } from './platform/hooks';
/** Les erreurs de chargement de route ne rendent jamais leur pile à l'écran. */
export function RouteFailure() {
  const t = usePlatformCopy();
  return (
    <main className="access-layout">
      <section className="platform-panel">
        <h1>{t.routeFailureTitle}</h1>
        <p>{t.routeFailureHelp}</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          {t.reloadApplication}
        </Button>
      </section>
    </main>
  );
}
