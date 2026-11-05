import { businessUi } from './business-copy';
import { useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, Notice } from '@orkobi/sdk-ui';
import { Check, X } from 'lucide-react';
import type { BusinessRecord, BusinessList, BusinessReport } from '@orkobi/contracts';
import { usePreferences } from '../preferences-context';
import { usePlatform } from './context';
import { usePlatformResource } from './hooks';
import { ResourceNotice } from './components';
import { BusinessWorkspace } from './business/workspace';
import { useBusinessWorkspace } from './business/workspace-context';
import { BusinessNavigation } from './business/navigation';
import { BusinessRecords } from './business/list';
import { BusinessRecordForm } from './business/record-form';
import { BusinessRecordDetail } from './business/detail';
import { BusinessReports } from './business/reports';
import { canEditRecord } from './business/presentation';
export function BusinessPage() {
  const { session } = usePlatform(),
    { pathname } = useLocation();
  const context = `${session.user?.id ?? ''}:${session.activeOrganizationId ?? ''}`;
  return (
    <BusinessWorkspace key={context}>
      <BusinessScreen key={pathname} />
    </BusinessWorkspace>
  );
}
function BusinessScreen() {
  const { module: moduleKey, entity: entityKey, id } = useParams(),
    { locale } = usePreferences(),
    { session } = usePlatform(),
    workspace = useBusinessWorkspace();
  const [params, setParams] = useSearchParams(),
    navigate = useNavigate(),
    { pathname } = useLocation(),
    [revision, setRevision] = useState(0);
  const definition = workspace.definitions.find((d) => d.key === moduleKey),
    entity = definition?.entities.find((e) => e.key === (entityKey ?? definition.entities[0]?.key));
  const org = session.organizations.find((org) => org.id === session.activeOrganizationId),
    permissions = org?.permissions ?? [],
    canRead = permissions.includes(`orkobi.${moduleKey}:read`),
    canWrite = permissions.includes(`orkobi.${moduleKey}:write`),
    canApprove = permissions.includes('orkobi.hr:approve');
  const module = workspace.modules?.find((module) => module.id === definition?.manifest.id),
    active = !workspace.modules || !!module?.active;
  const path = entity ? `business/${moduleKey}/${entity.key}` : null,
    base = entity ? `/business/${moduleKey}/${entity.key}` : '/modules',
    allowed = !!org && canRead && active && !workspace.loading,
    cursor = params.get('cursor');
  const list = usePlatformResource<BusinessList>(
    allowed && path && !id
      ? cursor
        ? `${path}?cursor=${encodeURIComponent(cursor)}`
        : path
      : null,
    revision,
  );
  const detail = usePlatformResource<{ record: BusinessRecord }>(
    allowed && path && id && id !== 'new' ? `${path}/${id}` : null,
    revision,
  );
  const report = usePlatformResource<BusinessReport>(
    allowed && moduleKey === 'reports' ? 'business/reports' : null,
    revision,
  );
  const record = detail.data?.record ?? null,
    isNew = id === 'new',
    editing = isNew || params.get('edit') === '1';
  const refresh = () => {
    workspace.references.clear();
    setRevision((value) => value + 1);
  };
  const saved = (next: BusinessRecord) => {
    workspace.references.clear();
    const target = `/business/${next.module}/${next.entity}/${next.id}`;
    workspace.notify(target, businessUi.changesSaved[locale]);
    if (target !== pathname) navigate(target, { replace: isNew });
    else {
      const query = new URLSearchParams(params);
      query.delete('edit');
      setParams(query, { replace: true });
      setRevision((value) => value + 1);
    }
  };
  return (
    <div
      className="business-workspace"
      aria-busy={
        workspace.loading ||
        list.loading ||
        list.refreshing ||
        detail.loading ||
        detail.refreshing ||
        report.loading ||
        report.refreshing
      }
    >
      <ResourceNotice
        loading={workspace.loading}
        error={workspace.error}
        onRetry={workspace.refresh}
      />
      {!workspace.loading && !workspace.error && !definition && (
        <Notice tone="error">
          {businessUi.moduleNotFound[locale]}
          <Button variant="text" to="/modules">
            {businessUi.backToModules[locale]}
          </Button>
        </Notice>
      )}
      {definition && (
        <>
          <BusinessNavigation definition={definition} entity={entity} detail={!!id} />
          {!org ? (
            <Notice>{businessUi.chooseOrganization[locale]}</Notice>
          ) : !canRead ? (
            <Notice tone="error">
              {businessUi.readPermissionRequired[locale]}
              <Button variant="text" to="/modules">
                {businessUi.viewOrganizationModules[locale]}
              </Button>
            </Notice>
          ) : !active ? (
            <Notice>
              {businessUi.moduleInactive[locale]}
              <Button variant="text" to="/modules">
                {businessUi.manageModules[locale]}
              </Button>
            </Notice>
          ) : (
            <>
              {moduleKey === 'sales' && (
                <Notice className="business-context-notice">
                  <strong>France · EUR.</strong> {businessUi.nonFiscalNotice[locale]}
                </Notice>
              )}
              {moduleKey === 'hr' && (
                <Notice className="business-context-notice">
                  {businessUi.hrScopeNotice[locale]}
                </Notice>
              )}
              {workspace.flash?.path === pathname && (
                <Notice tone="success" className="business-feedback">
                  <Check size={17} />
                  <span>{workspace.flash.text}</span>
                  <Button
                    variant="icon"
                    onClick={workspace.dismiss}
                    aria-label={businessUi.dismissMessage[locale]}
                  >
                    <X size={16} />
                  </Button>
                </Notice>
              )}
              {moduleKey === 'reports' ? (
                <BusinessReports
                  data={report.data}
                  loading={report.loading}
                  error={report.error}
                  refresh={refresh}
                />
              ) : !entity ? (
                <Notice tone="error">{businessUi.listNotFound[locale]}</Notice>
              ) : !id ? (
                <BusinessRecords
                  definition={definition}
                  entity={entity}
                  data={list.data}
                  loading={list.loading}
                  refreshing={list.refreshing}
                  error={list.error}
                  canWrite={canWrite}
                  refresh={refresh}
                />
              ) : (
                <>
                  {!isNew && (
                    <ResourceNotice
                      loading={detail.loading}
                      error={detail.error}
                      onRetry={refresh}
                    />
                  )}
                  {path &&
                  editing &&
                  canWrite &&
                  !entity.readOnly &&
                  (isNew || (record && canEditRecord(record))) ? (
                    <BusinessRecordForm
                      key={`${record?.id ?? 'new'}/${record?.revision ?? 0}/${revision}`}
                      refreshing={detail.refreshing}
                      entity={entity}
                      record={record}
                      path={path}
                      onSaved={saved}
                      onReload={refresh}
                      onCancel={() => {
                        if (isNew) navigate(base);
                        else {
                          const query = new URLSearchParams(params);
                          query.delete('edit');
                          setParams(query, { replace: true });
                        }
                      }}
                    />
                  ) : record ? (
                    <BusinessRecordDetail
                      record={record}
                      entity={entity}
                      canWrite={canWrite}
                      canApprove={canApprove}
                      onEdit={() => {
                        const query = new URLSearchParams(params);
                        query.set('edit', '1');
                        setParams(query);
                      }}
                      onSaved={saved}
                      onReload={refresh}
                    />
                  ) : isNew ? (
                    <Notice>{businessUi.createNotAllowed[locale]}</Notice>
                  ) : null}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
