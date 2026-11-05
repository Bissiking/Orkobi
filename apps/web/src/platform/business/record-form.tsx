import { businessUi } from '../business-copy';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@orkobi/sdk-ui';
import type { BusinessEntity, BusinessRecord } from '@orkobi/contracts';
import { usePreferences } from '../../preferences-context';
import { TaskForm, Field } from '../components';
import { useConfirm } from '../confirm-context';
import { BusinessInput, QuoteLines } from '../business-fields';
import { BusinessProblemNotice } from './feedback';
import { useBusinessMutation } from './use-mutation';
import { entityActions } from './presentation';
import { useUnsavedChanges } from '../unsaved-changes';
interface Upload {
  fileName: string;
  mediaType: string;
  contentBase64: string;
}
export function BusinessRecordForm({
  entity,
  record,
  path,
  onSaved,
  onCancel,
  onReload,
  refreshing,
}: {
  entity: BusinessEntity;
  record: BusinessRecord | null;
  path: string;
  onSaved: (record: BusinessRecord) => void;
  onCancel: () => void;
  onReload: () => void;
  refreshing: boolean;
}) {
  const { locale } = usePreferences(),
    mutation = useBusinessMutation(),
    confirm = useConfirm(),
    form = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<Upload | null>(null),
    [reading, setReading] = useState(false),
    [fileError, setFileError] = useState<'file_invalid' | 'file_too_large' | null>(null),
    [dirty, setDirty] = useState(false);
  const generation = useRef(0);
  const guard = useUnsavedChanges(dirty, mutation.pending);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (mutation.error || fileError) {
      form.current?.querySelector<HTMLElement>('[data-error-summary]')?.focus();
    }
  }, [mutation.error, fileError]);
  const cancel = () => {
    void guard.confirmLeave().then((accepted) => {
      if (accepted) onCancel();
    });
  };
  const optional = new Set(
    entity.key === 'contacts'
      ? ['siren', 'vatNumber', 'notes']
      : entity.key === 'employees'
        ? ['email', 'jobTitle']
        : [],
  );
  const fields = entity.fields.filter((field) => field.type !== 'file');
  const input = (field: (typeof fields)[number]) => (
    <BusinessInput
      key={field.key}
      field={field}
      record={record}
      invalid={mutation.error?.field === field.key}
    />
  );
  return (
    <section className="platform-panel business-panel business-editor">
      <div className="business-section-heading">
        <div>
          <h1>
            {record
              ? businessUi.editRecord[locale]
              : (entityActions[entity.key]?.[locale] ?? businessUi.newRecord[locale])}
          </h1>
          <p>
            {businessUi.fieldsMarkedAreRequired[locale]}
            {dirty && (
              <span className="business-unsaved" role="status">
                {businessUi.unsavedChanges[locale]}
              </span>
            )}
          </p>
        </div>
      </div>
      <TaskForm
        formRef={form}
        busy={refreshing}
        onChange={() => setDirty(true)}
        submit={businessUi.save[locale]}
        disabled={reading || mutation.pending}
        actions={
          <Button variant="secondary" disabled={mutation.pending || refreshing} onClick={cancel}>
            {businessUi.cancel[locale]}
          </Button>
        }
        onSave={async (data) => {
          setFileError(null);
          const values = Object.fromEntries(
            fields.map((field) => [field.key, String(data.get(field.key) ?? '')]),
          );
          const saved = await mutation.run(record ? `${path}/${record.id}` : path, {
            values,
            ...(record ? { expectedRevision: record.revision } : {}),
            ...(entity.key === 'quotes'
              ? { lines: JSON.parse(String(data.get('quoteLines'))) }
              : {}),
            ...(file ? { file } : {}),
          });
          if (saved) {
            guard.allow();
            setDirty(false);
            onSaved(saved);
          }
          return false;
        }}
      >
        <div tabIndex={-1} data-error-summary className="business-error-summary">
          <BusinessProblemNotice
            error={fileError ? { reason: fileError } : mutation.error}
            entity={entity}
            onReload={() => {
              if (!dirty) {
                onReload();
                return;
              }
              void confirm(businessUi.reloadAndDiscardChangesInThisForm[locale], {
                danger: true,
              }).then((ok) => {
                if (ok) onReload();
              });
            }}
          />
        </div>
        <div className="form-columns">
          {fields.filter((field) => !optional.has(field.key)).map(input)}
        </div>
        {optional.size > 0 && (
          <details className="business-additional-fields" open={!!record}>
            <summary>{businessUi.additionalDetails[locale]}</summary>
            <div className="form-columns">
              {fields.filter((field) => optional.has(field.key)).map(input)}
            </div>
          </details>
        )}
        {entity.key === 'quotes' && <QuoteLines record={record} onDirty={() => setDirty(true)} />}
        {entity.key === 'files' && !record && (
          <Field
            label={businessUi.fileRequired[locale]}
            name="file"
            type="file"
            required
            accept="application/pdf,image/png,image/jpeg,text/plain"
            help={businessUi.fileUploadHelp[locale]}
            onChange={(event) => {
              setFile(null);
              setFileError(null);
              setReading(false);
              const current = ++generation.current,
                chosen = event.currentTarget.files?.[0];
              if (!chosen) return;
              if (!chosen.size || chosen.size > 49152) {
                setFileError('file_too_large');
                return;
              }
              setReading(true);
              const reader = new FileReader();
              reader.onload = () => {
                if (current !== generation.current) return;
                setFile({
                  fileName: chosen.name,
                  mediaType: chosen.type || 'text/plain',
                  contentBase64: String(reader.result).split(',')[1] ?? '',
                });
                setReading(false);
              };
              reader.onerror = () => {
                if (current !== generation.current) return;
                setFileError('file_invalid');
                setReading(false);
              };
              reader.readAsDataURL(chosen);
            }}
          />
        )}
        {reading && <p role="status">{businessUi.readingFile[locale]}</p>}
      </TaskForm>
    </section>
  );
}
