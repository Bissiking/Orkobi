import { businessUi } from '../business-copy';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@orkobi/sdk-ui';
import { X } from 'lucide-react';
import type { BusinessEntity, BusinessRecord } from '@orkobi/contracts';
import { usePreferences } from '../../preferences-context';
import { TaskForm, Field } from '../components';
import { recordActions, recordTitle } from './presentation';
import type { BusinessAction } from './presentation';
import { formatMinor } from '../business-copy';
import { BusinessProblemNotice } from './feedback';
import { useBusinessMutation } from './use-mutation';
export function BusinessRecordActions({
  record,
  entity,
  canWrite,
  canApprove,
  onSaved,
  onReload,
}: {
  record: BusinessRecord;
  entity: BusinessEntity;
  canWrite: boolean;
  canApprove: boolean;
  onSaved: (record: BusinessRecord) => void;
  onReload: () => void;
}) {
  const { locale } = usePreferences(),
    [selected, setSelected] = useState<BusinessAction | null>(null);
  const close = () => {
    if (!dialog.current?.querySelector('form[aria-busy="true"]')) {
      dialog.current?.close();
      setSelected(null);
    }
  };
  const actions = recordActions(record, canWrite, canApprove),
    dialog = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);
  if (!actions.length) return null;
  return (
    <div className="business-actions">
      <div className="row-actions">
        {actions.map((action, index) => (
          <Button
            key={action.key}
            variant={index === 0 && !action.danger ? 'primary' : 'secondary'}
            className={action.danger ? 'business-quiet-action' : undefined}
            onClick={() => setSelected(action)}
          >
            {action.label[locale]}
          </Button>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="business-action-dialog"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {selected && (
          <>
            <header>
              <h2 id={titleId}>{selected.label[locale]}</h2>
              <Button variant="icon" aria-label={businessUi.close[locale]} onClick={close}>
                <X size={20} />
              </Button>
            </header>
            <p className="business-action-target">
              {recordTitle(record)}
              {record.data.totalMinor
                ? ` · ${formatMinor(record.data.totalMinor, locale)}`
                : record.data.amount
                  ? ` · ${String(record.data.amount)} €`
                  : ''}
            </p>
            <p>{selected.description[locale]}</p>
            <ActionForm
              key={`${record.id}/${record.revision}/${selected.key}`}
              action={selected}
              entity={entity}
              record={record}
              onCancel={close}
              onReload={() => {
                close();
                onReload();
              }}
              onSaved={(saved) => {
                dialog.current?.close();
                setSelected(null);
                onSaved(saved);
              }}
            />
          </>
        )}
      </dialog>
    </div>
  );
}
function ActionForm({
  action,
  record,
  entity,
  onCancel,
  onSaved,
  onReload,
}: {
  action: BusinessAction;
  record: BusinessRecord;
  entity: BusinessEntity;
  onCancel: () => void;
  onSaved: (record: BusinessRecord) => void;
  onReload: () => void;
}) {
  const { locale } = usePreferences(),
    mutation = useBusinessMutation();
  return (
    <TaskForm
      submit={businessUi.confirm[locale]}
      submitVariant={action.danger ? 'secondary' : 'primary'}
      actions={
        <Button variant="text" onClick={onCancel} disabled={mutation.pending}>
          {businessUi.cancel[locale]}
        </Button>
      }
      onSave={async (form) => {
        const saved = await mutation.run(
          `business/${record.module}/${record.entity}/${record.id}/${action.key}`,
          { expectedRevision: record.revision, ...Object.fromEntries(form) },
        );
        if (saved) onSaved(saved);
        return false;
      }}
    >
      {action.key === 'accept' && (
        <Field
          label={businessUi.evidenceReferenceOfAcceptance[locale]}
          name="acceptanceReference"
          required
          maxLength={200}
        />
      )}
      {action.key === 'reverse' && (
        <Field label={businessUi.reversalReason[locale]} name="reason" required maxLength={160} />
      )}
      {action.key === 'pay' && (
        <>
          <Field label={businessUi.paidOn[locale]} type="date" name="paidOn" required />
          <label className="platform-field">
            <span>{businessUi.paymentMethod[locale]}</span>
            <select name="method">
              <option value="transfer">{businessUi.transfer[locale]}</option>
              <option value="cash">{businessUi.cash[locale]}</option>
              <option value="check">{businessUi.check[locale]}</option>
              <option value="other">{businessUi.other[locale]}</option>
            </select>
          </label>
          <Field
            label={businessUi.paymentReference[locale]}
            name="paymentReference"
            required={false}
          />
        </>
      )}
      <BusinessProblemNotice error={mutation.error} entity={entity} onReload={onReload} />
    </TaskForm>
  );
}
