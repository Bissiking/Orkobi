import { businessUi } from '../business-copy';
import { Button, Notice } from '@orkobi/sdk-ui';
import type { BusinessEntity, BusinessRecord } from '@orkobi/contracts';
import { usePreferences } from '../../preferences-context';
import { StatusPill } from '@orkobi/sdk-ui';
import { businessProblems, stateLabels } from '../business-copy';
import type { BusinessFailure } from './use-mutation';
export function BusinessProblemNotice({
  error,
  entity,
  onReload,
}: {
  error: BusinessFailure | null;
  entity: BusinessEntity;
  onReload?: () => void;
}) {
  const { locale } = usePreferences();
  if (!error) return null;
  return (
    <Notice tone="error">
      <p>
        {error.reason ? businessProblems[error.reason][locale] : businessUi.operationFailed[locale]}
        {error.field
          ? ` (${entity.fields.find((field) => field.key === error.field)?.label[locale] ?? error.field})`
          : ''}
      </p>
      {onReload && ['revision_conflict', 'idempotency_conflict'].includes(error.reason ?? '') && (
        <Button variant="text" onClick={onReload}>
          {businessUi.reloadRecord[locale]}
        </Button>
      )}
    </Notice>
  );
}
export function RecordStatus({ state }: { state: BusinessRecord['state'] }) {
  const { locale } = usePreferences();
  const tone = ['paid', 'approved', 'accepted', 'done', 'active'].includes(state)
    ? 'positive'
    : ['rejected', 'reversed', 'archived'].includes(state)
      ? 'muted'
      : 'pending';
  return <StatusPill tone={tone}>{stateLabels[state]?.[locale] ?? state}</StatusPill>;
}
