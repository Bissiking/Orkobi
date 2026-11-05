import { businessUi } from '../business-copy';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, AppIcon } from '@orkobi/sdk-ui';
import { ArrowRight, Plus, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import type { BusinessDefinition, BusinessEntity, BusinessList } from '@orkobi/contracts';
import { usePreferences } from '../../preferences-context';
import { ResourceNotice } from '../components';
import { SearchField, EmptyState, DataTable, Th } from '@orkobi/sdk-ui';
import { stateLabels } from '../business-copy';
import {
  columnLabel,
  displayValue,
  filterRecords,
  recordTitle,
  entityActions,
} from './presentation';
import { CheckField } from '@orkobi/sdk-ui';
import { RecordStatus } from './feedback';
export function BusinessRecords({
  definition,
  entity,
  data,
  loading,
  refreshing,
  error,
  canWrite,
  refresh,
}: {
  definition: BusinessDefinition;
  entity: BusinessEntity;
  data: BusinessList | null;
  loading: boolean;
  refreshing: boolean;
  error: false | string;
  canWrite: boolean;
  refresh: () => void;
}) {
  const { locale } = usePreferences(),
    [params, setParams] = useSearchParams();
  const [cursors, setCursors] = useState<(string | null)[]>(() => [params.get('cursor')]);
  const query = params.get('q') ?? '',
    state = params.get('state') ?? '',
    archived = params.get('archived') === '1',
    cursor = params.get('cursor');
  const records = data?.records ?? [],
    rows = useMemo(
      () => filterRecords(records, query, state, archived, entity, locale),
      [records, query, state, archived, entity, locale],
    );
  const states = [
    ...new Set([...records.map((record) => record.state), ...(state ? [state] : [])]),
  ].filter((item) => archived || item !== 'archived' || item === state);
  const pageIndex = cursors.indexOf(cursor);
  const paginated = !!cursor || !!data?.nextCursor;
  const filtered = !!query || !!state || archived,
    path = `/business/${definition.key}/${entity.key}`;
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: key === 'q' });
  };
  const primary =
    entity.columns.find((key) => key === 'name' || key === 'title') ?? entity.columns[0];
  const columns = ['quotes', 'invoices'].includes(entity.key)
      ? ['number', ...entity.columns]
      : [...(primary ? [primary] : []), ...entity.columns.filter((key) => key !== primary)],
    canCreate = canWrite && !entity.readOnly && !(entity.key === 'profile' && records.length > 0);
  return (
    <section
      className="platform-panel business-panel business-list"
      aria-busy={loading || refreshing}
    >
      <div className="business-section-heading">
        <div>
          <h1>{entity.label[locale]}</h1>
          <p>{businessUi.recordsHelp[locale]}</p>
        </div>
        <div className="row-actions">
          <Button
            variant="icon"
            onClick={refresh}
            disabled={loading || refreshing}
            aria-label={businessUi.refreshList[locale]}
          >
            <RotateCw size={18} />
          </Button>
          {canWrite && entity.key === 'profile' && records[0] && (
            <Button variant="secondary" to={`${path}/${records[0].id}?edit=1`}>
              {businessUi.editBusinessIdentity[locale]}
            </Button>
          )}
          {canCreate && (
            <Button variant="primary" to={`${path}/new`}>
              <Plus size={17} />
              {entityActions[entity.key]?.[locale] ?? businessUi.addRecord[locale]}
            </Button>
          )}
        </div>
      </div>
      <div className="business-list-tools">
        <SearchField
          className="business-search"
          label={businessUi.filterThisPage[locale]}
          value={query}
          placeholder={businessUi.searchThisPage[locale]}
          onChange={(value) => update('q', value)}
          onClear={() => update('q', '')}
          clearLabel={businessUi.clearSearch[locale]}
        />
        <label className="business-state-filter">
          <span className="sr-only">{businessUi.statusOnThisPage[locale]}</span>
          <select value={state} onChange={(event) => update('state', event.target.value)}>
            <option value="">{businessUi.allStatuses[locale]}</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {stateLabels[state]?.[locale] ?? state}
              </option>
            ))}
          </select>
        </label>
        <CheckField
          label={businessUi.archived[locale]}
          checked={archived}
          onChange={(event) => update('archived', event.target.checked ? '1' : '')}
        />
      </div>
      <ResourceNotice loading={loading} error={error} onRetry={refresh} />
      {!loading && !error && data && rows.length === 0 && (
        <EmptyState
          className="business-empty"
          icon={<AppIcon name={definition.icon} size={32} />}
          title={
            filtered
              ? businessUi.noMatchesOnThisPage[locale]
              : businessUi.startWithYourFirstRecord[locale]
          }
          description={
            filtered ? businessUi.emptyFilterHelp[locale] : businessUi.firstRecordHelp[locale]
          }
        >
          {filtered ? (
            <Button
              variant="secondary"
              onClick={() => {
                const next = new URLSearchParams(params);
                ['q', 'state', 'archived'].forEach((key) => next.delete(key));
                setParams(next);
              }}
            >
              {businessUi.clearFilters[locale]}
            </Button>
          ) : canCreate ? (
            <Button variant="primary" to={`${path}/new`}>
              {entityActions[entity.key]?.[locale] ?? businessUi.addRecord[locale]}
            </Button>
          ) : null}
        </EmptyState>
      )}
      {rows.length > 0 && (
        <DataTable
          label={entity.label[locale]}
          className="business-records-region"
          tableClassName="business-table"
        >
          <thead>
            <tr>
              {columns.map((column) => (
                <Th key={column}>{columnLabel(entity, column, locale)}</Th>
              ))}
              <Th>{businessUi.status[locale]}</Th>
              <Th>
                <span className="sr-only">{businessUi.open[locale]}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => (
              <tr key={record.id}>
                {columns.map((column, index) => (
                  <td key={column} data-label={columnLabel(entity, column, locale)}>
                    {index === 0 ? (
                      <Link className="business-record-link" to={`${path}/${record.id}`}>
                        {displayValue(record, entity, column, locale)}
                      </Link>
                    ) : (
                      displayValue(record, entity, column, locale)
                    )}
                  </td>
                ))}
                <td data-label={businessUi.status[locale]}>
                  <RecordStatus state={record.state} />
                </td>
                <td className="business-row-open">
                  <Button
                    variant="icon"
                    to={`${path}/${record.id}`}
                    aria-label={`${businessUi.open[locale]} ${recordTitle(record)}`}
                  >
                    <ArrowRight size={18} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {data && !error && (records.length > 0 || paginated) && (
        <footer className="business-pagination">
          <p aria-live="polite">
            {rows.length} {businessUi.pageRecordCount[locale]}
            {filtered && ` / ${records.length}`}. <span>{businessUi.upTo100PerPage[locale]}</span>
          </p>
          {paginated && (
            <div className="row-actions">
              {cursor && (
                <Button
                  variant="text"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete('cursor');
                    setCursors([null]);
                    setParams(next);
                  }}
                >
                  {businessUi.firstPage[locale]}
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={pageIndex <= 0 || loading || refreshing}
                onClick={() => {
                  const previous = cursors[pageIndex - 1],
                    next = new URLSearchParams(params);
                  if (previous) next.set('cursor', previous);
                  else next.delete('cursor');
                  setParams(next);
                }}
              >
                <ChevronLeft size={16} />
                {businessUi.previous[locale]}
              </Button>
              <Button
                variant="secondary"
                disabled={!data.nextCursor || loading || refreshing}
                onClick={() => {
                  if (!data.nextCursor) return;
                  const next = new URLSearchParams(params);
                  next.set('cursor', data.nextCursor);
                  setCursors((old) =>
                    old.includes(data.nextCursor)
                      ? old
                      : [
                          ...(pageIndex < 0 ? [cursor] : old.slice(0, pageIndex + 1)),
                          data.nextCursor,
                        ],
                  );
                  setParams(next);
                }}
              >
                {businessUi.next[locale]}
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </footer>
      )}
    </section>
  );
}
