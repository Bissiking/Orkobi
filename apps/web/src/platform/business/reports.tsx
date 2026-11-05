import { businessUi } from '../business-copy';
import { Button } from '@orkobi/sdk-ui';
import { RotateCw } from 'lucide-react';
import type { BusinessReport } from '@orkobi/contracts';
import { usePreferences } from '../../preferences-context';
import { ResourceNotice } from '../components';
import { formatMinor } from '../business-copy';
import { useBusinessWorkspace } from './workspace-context';
import { RecordStatus } from './feedback';
export function BusinessReports({
  data,
  loading,
  error,
  refresh,
}: {
  data: BusinessReport | null;
  loading: boolean;
  error: false | string;
  refresh: () => void;
}) {
  const { locale } = usePreferences(),
    { definitions } = useBusinessWorkspace();
  return (
    <section className="platform-panel business-panel business-reports" aria-busy={loading}>
      <div className="business-section-heading">
        <div>
          <h1>{businessUi.organizationReport[locale]}</h1>
          <p>{businessUi.reportScopeHelp[locale]}</p>
        </div>
        <Button variant="secondary" onClick={refresh} disabled={loading}>
          <RotateCw size={16} />
          {businessUi.refresh[locale]}
        </Button>
      </div>
      <ResourceNotice loading={loading} error={error} onRetry={refresh} />
      <p className="business-report-note">{businessUi.reportAmountsNotice[locale]}</p>
      {data?.modules.map((item) => (
        <section key={item.key} className="business-report">
          <h2>
            {definitions.find((definition) => definition.key === item.key)?.label[locale] ??
              item.key}
          </h2>
          {!item.rows.length ? (
            <p>{businessUi.noRecordsInThisModule[locale]}</p>
          ) : (
            <dl>
              {item.rows.map((row) => (
                <div key={`${row.entity}/${row.state}`}>
                  <dt>
                    {definitions
                      .find((d) => d.key === item.key)
                      ?.entities.find((entity) => entity.key === row.entity)?.label[locale] ??
                      row.entity}{' '}
                    <RecordStatus state={row.state} />
                  </dt>
                  <dd>
                    <strong>{new Intl.NumberFormat(locale).format(row.count)}</strong>{' '}
                    {businessUi.recordCount[locale]}
                    {row.amountMinor !== '0' && (
                      <span> · {formatMinor(row.amountMinor, locale)}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}
      {data?.modules.length === 0 && <p>{businessUi.reportEmpty[locale]}</p>}
      {data && (
        <p className="business-report-time">
          {businessUi.updatedOn[locale]}{' '}
          {new Intl.DateTimeFormat(businessUi.enGB[locale], {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(data.generatedAt))}
        </p>
      )}
    </section>
  );
}
