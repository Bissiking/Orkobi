import { businessUi } from '../business-copy';
import { useState } from 'react';
import { Button, Notice } from '@orkobi/sdk-ui';
import { Pencil, Printer, Download, RotateCw } from 'lucide-react';
import type { BusinessEntity, BusinessRecord } from '@orkobi/contracts';
import { usePreferences } from '../../preferences-context';
import { platformRequest } from '../api';
import { displayValue, recordTitle, canEditRecord } from './presentation';
import { RecordStatus } from './feedback';
import { BusinessRecordActions } from './actions';
import { BusinessDocument } from './document';
export function BusinessRecordDetail({
  record,
  entity,
  canWrite,
  canApprove,
  onEdit,
  onSaved,
  onReload,
}: {
  record: BusinessRecord;
  entity: BusinessEntity;
  canWrite: boolean;
  canApprove: boolean;
  onEdit: () => void;
  onSaved: (record: BusinessRecord) => void;
  onReload: () => void;
}) {
  const { locale } = usePreferences(),
    [downloading, setDownloading] = useState(false),
    [error, setError] = useState(false);
  const document = record.module === 'sales' && ['quotes', 'invoices'].includes(record.entity);
  const fields = entity.fields.filter(
    (field) =>
      field.type !== 'file' &&
      record.data[field.key] !== undefined &&
      record.data[field.key] !== '',
  );
  const title = recordTitle(record);
  return (
    <section className="platform-panel business-panel business-detail">
      <div className="business-section-heading">
        <div>
          <div className="business-record-heading">
            <h1>{title}</h1>
            <RecordStatus state={record.state} />
          </div>
          <p>
            {entity.label[locale]}
            {record.reference && record.reference !== title
              ? ` · ${record.reference.startsWith('QUOTE/') || record.reference.length > 60 ? record.id.slice(0, 8) : record.reference}`
              : ''}
          </p>
        </div>
        <div className="row-actions">
          <Button variant="icon" onClick={onReload} aria-label={businessUi.refreshRecord[locale]}>
            <RotateCw size={17} />
          </Button>
          {canWrite && !entity.readOnly && canEditRecord(record) && (
            <Button variant="secondary" onClick={onEdit}>
              <Pencil size={16} />
              {businessUi.edit[locale]}
            </Button>
          )}
          {document && (
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={16} />
              {businessUi.print[locale]}
            </Button>
          )}
        </div>
      </div>
      <BusinessRecordActions
        record={record}
        entity={entity}
        canWrite={canWrite}
        canApprove={canApprove}
        onSaved={onSaved}
        onReload={onReload}
      />
      {!document && fields.length > 0 && (
        <dl className="business-record-values">
          {fields.map((field) => (
            <div className="business-detail-row" key={field.key}>
              <dt>{field.label[locale]}</dt>
              <dd>{displayValue(record, entity, field.key, locale)}</dd>
            </div>
          ))}
        </dl>
      )}
      {document && <BusinessDocument record={record} />}
      {record.entity === 'files' && (
        <>
          <dl className="business-record-values">
            {['fileName', 'size', 'mediaType'].map((key) => (
              <div className="business-detail-row" key={key}>
                <dt>
                  {key === 'fileName'
                    ? businessUi.file[locale]
                    : key === 'size'
                      ? businessUi.size[locale]
                      : businessUi.format[locale]}
                </dt>
                <dd>{displayValue(record, entity, key, locale)}</dd>
              </div>
            ))}
          </dl>
          <Button
            variant="primary"
            disabled={downloading}
            onClick={() => {
              setDownloading(true);
              setError(false);
              void platformRequest<{ contentBase64: string; fileName: string }>(
                `business/documents/files/${record.id}/download`,
              )
                .then((file) => {
                  const bytes = Uint8Array.from(atob(file.contentBase64), (char) =>
                      char.charCodeAt(0),
                    ),
                    url = URL.createObjectURL(
                      new Blob([bytes], { type: 'application/octet-stream' }),
                    ),
                    link = window.document.createElement('a');
                  link.href = url;
                  link.download = file.fileName;
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                })
                .catch(() => setError(true))
                .finally(() => setDownloading(false));
            }}
          >
            <Download size={17} />
            {downloading ? businessUi.downloading[locale] : businessUi.downloadDocument[locale]}
          </Button>
          {error && <Notice tone="error">{businessUi.downloadUnavailable[locale]}</Notice>}
        </>
      )}
      <details className="business-record-meta">
        <summary>{businessUi.recordInformation[locale]}</summary>
        <dl>
          <dt>{businessUi.id[locale]}</dt>
          <dd>{record.id}</dd>
          <dt>{businessUi.revision[locale]}</dt>
          <dd>{record.revision}</dd>
        </dl>
      </details>
    </section>
  );
}
