import { useEffect, useState } from 'react';
import { usePreferences } from './preferences-context';
import { clearErrorReports, errorBannerEnabled, subscribeErrorReports } from './errors';
import type { ErrorReport } from './errors';
import { Button } from '@orkobi/sdk-ui';

export default function ErrorBanner() {
  const { messages: t } = usePreferences();
  const [reports, setReports] = useState<ErrorReport[]>([]);
  useEffect(() => subscribeErrorReports(setReports), []);
  if (!errorBannerEnabled() || reports.length === 0) return null;
  return (
    <aside className="error-banner" role="status" aria-label={t.errorBannerTitle}>
      <div className="error-banner-head">
        <strong>{t.errorBannerTitle}</strong>
        <Button variant="text" onClick={clearErrorReports}>
          {t.errorBannerDismiss}
        </Button>
      </div>
      <ul>
        {reports.map((report) => (
          <li key={`${report.at}-${report.scope}-${report.name}`}>
            <code>
              [{report.scope}] {report.name}
            </code>{' '}
            <span>{report.message}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
