import './business.css';
import { useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router';
import { Button, Notice, AppIcon, Field } from '@orkobi/sdk-ui';
import type {
  BusinessDefinition,
  BusinessRecord,
  BusinessList,
  BusinessReport,
  BusinessProblem,
} from '@orkobi/contracts';
import { usePreferences } from '../preferences-context';
import { usePlatform } from './context';
import { usePlatformResource } from './hooks';
import { platformRequest, PlatformApiError } from './api';
import { PlatformHeading, ResourceNotice, TaskForm } from './components';
import { BusinessInput, QuoteLines } from './business-fields';
import { businessProblems, stateLabels, formatMinor } from './business-copy';
interface Catalog {
  definitions: BusinessDefinition[];
  billingProviderAvailable: boolean;
}
function RecordValues({
  record,
  definition,
}: {
  record: BusinessRecord;
  definition: BusinessDefinition;
}) {
  const { locale } = usePreferences(),
    entity = definition.entities.find((e) => e.key === record.entity)!;
  return (
    <dl className="business-record-values">
      {entity.fields
        .filter((field) => field.type !== 'file' && record.data[field.key] !== undefined)
        .map((field) => (
          <div className="business-detail-row" key={field.key}>
            <dt>{field.label[locale]}</dt>
            <dd>
              {field.options?.find((option) => option.value === record.data[field.key])?.label[
                locale
              ] ??
                String(
                  (field.reference ? record.data[field.key.replace(/Id$/u, 'Name')] : undefined) ??
                    record.data[field.key] ??
                    '—',
                )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
export function BusinessPage() {
  const { module: moduleKey, entity: entityKey, id } = useParams(),
    { locale } = usePreferences(),
    fr = locale === 'fr',
    { session, post } = usePlatform();
  const [params, setParams] = useSearchParams(),
    [revision, setRevision] = useState(0),
    [problem, setProblem] = useState<{ reason?: BusinessProblem; field?: string } | null>(null),
    [success, setSuccess] = useState(false),
    [file, setFile] = useState<{
      fileName: string;
      mediaType: string;
      contentBase64: string;
    } | null>(null),
    [fileLoading, setFileLoading] = useState(false);
  const navigate = useNavigate();
  const requestKey = useRef(crypto.randomUUID());
  const fileGeneration = useRef(0);
  const catalog = usePlatformResource<Catalog>(session.user ? 'business' : null, revision),
    definition = catalog.data?.definitions.find((d) => d.key === moduleKey),
    entity = definition?.entities.find((e) => e.key === (entityKey ?? definition.entities[0]?.key));
  const organization = session.organizations.find((org) => org.id === session.activeOrganizationId),
    permissions = organization?.permissions ?? [],
    canRead = permissions.includes(`orkobi.${moduleKey}:read`),
    canWrite = permissions.includes(`orkobi.${moduleKey}:write`),
    canApprove = permissions.includes('orkobi.hr:approve');
  const path = entity ? `business/${moduleKey}/${entity.key}` : null;
  const list = usePlatformResource<BusinessList>(
    organization && canRead && path
      ? `${path}${params.get('cursor') ? `?cursor=${params.get('cursor')}` : ''}`
      : null,
    revision,
  );
  const detail = usePlatformResource<{ record: BusinessRecord }>(
    organization && canRead && path && id && id !== 'new' ? `${path}/${id}` : null,
    revision,
  );
  const report = usePlatformResource<BusinessReport>(
    organization && canRead && moduleKey === 'reports' ? 'business/reports' : null,
    revision,
  );
  const record = detail.data?.record ?? null,
    isNew = id === 'new',
    editable =
      !entity?.readOnly &&
      (isNew ||
        (record &&
          ![
            'archived',
            'done',
            'reversed',
            'posted',
            'prepared',
            'accepted',
            'converted',
            'rejected',
            'approved',
            'paid',
          ].includes(record.state)));
  const refresh = () => {
    setProblem(null);
    setSuccess(false);
    setRevision((value) => value + 1);
    requestKey.current = crypto.randomUUID();
  };
  const mutate = async (endpoint: string, body: Record<string, unknown>) => {
    setProblem(null);
    setSuccess(false);
    try {
      const result = await post<{ record: BusinessRecord }>(endpoint, {
        ...body,
        idempotencyKey: requestKey.current,
      });
      requestKey.current = crypto.randomUUID();
      setSuccess(true);
      setRevision((value) => value + 1);
      return result.record;
    } catch (error) {
      setProblem(
        error instanceof PlatformApiError
          ? {
              ...(error.reason ? { reason: error.reason } : {}),
              ...(error.field ? { field: error.field } : {}),
            }
          : {},
      );
      return null;
    }
  };
  const actions: { key: string; label: string }[] = [];
  if (record && canWrite) {
    if (moduleKey === 'sales' && entity?.key === 'quotes') {
      if (record.state === 'draft')
        actions.push({ key: 'prepare', label: fr ? 'Préparer le devis' : 'Prepare quote' });
      if (record.state === 'prepared')
        actions.push(
          {
            key: 'accept',
            label: fr ? 'Enregistrer l’accord du client' : 'Record customer acceptance',
          },
          { key: 'reject', label: fr ? 'Enregistrer le refus' : 'Record rejection' },
        );
      if (record.state === 'accepted')
        actions.push({ key: 'convert', label: fr ? 'Préparer la facture' : 'Prepare invoice' });
    }
    if (
      moduleKey === 'stock' &&
      entity?.key === 'movements' &&
      record.state === 'posted' &&
      !record.data.reversesId
    )
      actions.push({ key: 'reverse', label: fr ? 'Compenser ce mouvement' : 'Reverse movement' });
    if (moduleKey === 'projects' && ['projects', 'tasks'].includes(entity?.key ?? '')) {
      if (['active', 'todo', 'doing'].includes(record.state))
        actions.push({ key: 'complete', label: fr ? 'Terminer' : 'Complete' });
      if (record.state === 'todo') actions.push({ key: 'start', label: fr ? 'Démarrer' : 'Start' });
      if (record.state === 'done')
        actions.push({ key: 'reopen', label: fr ? 'Rouvrir' : 'Reopen' });
    }
    if (moduleKey === 'members' && entity?.key === 'dues' && record.state === 'pending')
      actions.push({ key: 'pay', label: fr ? 'Enregistrer le règlement' : 'Record payment' });
    if (
      !['movements', 'balances', 'invoices', 'profile'].includes(entity?.key ?? '') &&
      !['archived', 'paid'].includes(record.state) &&
      !(entity?.key === 'quotes' && record.state !== 'draft') &&
      !(moduleKey === 'hr' && entity?.key === 'leave' && record.state === 'approved')
    )
      actions.push({ key: 'archive', label: fr ? 'Archiver' : 'Archive' });
  }
  if (
    record &&
    canApprove &&
    moduleKey === 'hr' &&
    entity?.key === 'leave' &&
    record.state === 'requested'
  )
    actions.push(
      { key: 'approve', label: fr ? 'Approuver' : 'Approve' },
      { key: 'reject', label: fr ? 'Refuser' : 'Reject' },
    );
  const query = params.get('q') ?? '',
    rows = (list.data?.records ?? []).filter(
      (row) =>
        (params.get('archived') === '1' || row.state !== 'archived') &&
        JSON.stringify(row.data)
          .toLocaleLowerCase(locale)
          .includes(query.toLocaleLowerCase(locale)),
    );
  const preview = record && moduleKey === 'sales' && ['quotes', 'invoices'].includes(record.entity);
  const columns = entity?.columns ?? [];
  return (
    <>
      <PlatformHeading
        title={definition?.label[locale] ?? (fr ? 'Modules métier' : 'Business modules')}
        description={
          organization?.name ?? (fr ? 'Sélectionnez une organisation.' : 'Select an organization.')
        }
      />
      <ResourceNotice loading={catalog.loading} error={catalog.error} onRetry={refresh} />
      {!catalog.loading && !definition && (
        <Notice tone="error">{fr ? 'Ce module est inconnu.' : 'Unknown module.'}</Notice>
      )}
      {definition && (
        <nav
          className="business-navigation"
          aria-label={fr ? 'Modules métier' : 'Business modules'}
        >
          {catalog.data?.definitions.map((d) => (
            <Button
              key={d.key}
              variant={d.key === moduleKey ? 'primary' : 'text'}
              to={`/business/${d.key}`}
            >
              <AppIcon name={d.icon} size={18} />
              {d.label[locale]}
            </Button>
          ))}
        </nav>
      )}
      {definition && !organization && (
        <Notice>
          {fr
            ? 'Choisissez une organisation pour continuer.'
            : 'Choose an organization to continue.'}
        </Notice>
      )}
      {definition && organization && !canRead && (
        <Notice>
          {fr
            ? 'Ce module nécessite un droit de consultation explicite. Demandez son attribution à un administrateur.'
            : 'This module requires explicit read permission. Ask an administrator to grant it.'}
          <Button variant="text" to="/modules">
            {fr ? 'Voir les modules' : 'View modules'}
          </Button>
        </Notice>
      )}
      {definition && organization && canRead && (
        <>
          {moduleKey === 'sales' && (
            <Notice>
              {fr
                ? 'France · EUR. Les factures sont des préparations internes non fiscales. L’émission et la transmission restent bloquées sans plateforme agréée.'
                : 'France · EUR. Invoices are internal non-fiscal preparations. Issuance and transmission remain blocked without an approved platform.'}
            </Notice>
          )}
          {moduleKey === 'documents' && (
            <Notice>
              {fr
                ? 'PDF, PNG, JPEG ou texte UTF-8 · 48 Kio par fichier · 10 Mio par organisation. Téléchargement uniquement, sans aperçu actif.'
                : 'PDF, PNG, JPEG or UTF-8 text · 48 KiB per file · 10 MiB per organization. Download only, without an active preview.'}
            </Notice>
          )}
          {moduleKey === 'hr' && (
            <Notice>
              {fr
                ? 'Suivi administratif uniquement : hors paie, données médicales et déclarations sociales.'
                : 'Administrative tracking only: excludes payroll, health data and statutory reporting.'}
            </Notice>
          )}
          {problem && (
            <Notice tone="error">
              {problem.reason
                ? businessProblems[problem.reason][locale]
                : fr
                  ? 'Opération impossible. Vérifiez vos droits ou rechargez la page.'
                  : 'Operation failed. Check your permissions or reload the page.'}
              {problem.field &&
                ` (${entity?.fields.find((field) => field.key === problem.field)?.label[locale] ?? problem.field})`}
            </Notice>
          )}
          {success && (
            <Notice tone="success">{fr ? 'Opération enregistrée.' : 'Operation saved.'}</Notice>
          )}
          {moduleKey === 'reports' ? (
            <section className="platform-panel business-panel">
              <div className="page-heading">
                <h2>{fr ? 'Rapport de l’organisation' : 'Organization report'}</h2>
                <Button variant="secondary" onClick={refresh}>
                  {fr ? 'Actualiser' : 'Refresh'}
                </Button>
              </div>
              <ResourceNotice loading={report.loading} error={report.error} onRetry={refresh} />
              <p>
                {fr
                  ? 'Données complètes des modules actifs que vous pouvez consulter. Les montants des devis et préparations ne constituent pas un chiffre d’affaires facturé.'
                  : 'Complete data from active modules you may read. Quote and preparation amounts are not invoiced revenue.'}
              </p>
              {report.data?.modules.map((item) => (
                <div key={item.key} className="business-report">
                  <h3>
                    {catalog.data?.definitions.find((d) => d.key === item.key)?.label[locale]}
                  </h3>
                  {item.rows.length === 0 ? (
                    <p>{fr ? 'Aucune donnée.' : 'No data.'}</p>
                  ) : (
                    <ul>
                      {item.rows.map((row) => (
                        <li key={`${row.entity}/${row.state}`}>
                          {catalog.data?.definitions
                            .find((d) => d.key === item.key)
                            ?.entities.find((e) => e.key === row.entity)?.label[locale] ??
                            row.entity}{' '}
                          · {stateLabels[row.state]?.[locale] ?? row.state} :{' '}
                          <strong>{row.count}</strong>
                          {row.amountMinor !== '0' && ` · ${formatMinor(row.amountMinor, locale)}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          ) : (
            <>
              <nav className="platform-tabs admin-tabs" aria-label={definition.label[locale]}>
                {definition.entities.map((e) => (
                  <Button
                    key={e.key}
                    variant={e.key === entity?.key ? 'primary' : 'text'}
                    to={`/business/${moduleKey}/${e.key}`}
                  >
                    {e.label[locale]}
                  </Button>
                ))}
              </nav>
              {entity && (
                <section className="platform-panel business-panel">
                  <div className="page-heading">
                    <h2>{entity.label[locale]}</h2>
                    <div className="row-actions">
                      <Button variant="secondary" onClick={refresh}>
                        {fr ? 'Actualiser' : 'Refresh'}
                      </Button>
                      {canWrite && !entity.readOnly && (
                        <Button variant="primary" to={`/business/${moduleKey}/${entity.key}/new`}>
                          {fr ? 'Créer une fiche' : 'Create record'}
                        </Button>
                      )}
                      {id && (
                        <Button variant="text" to={`/business/${moduleKey}/${entity.key}`}>
                          {fr ? 'Retour à la liste' : 'Back to list'}
                        </Button>
                      )}
                    </div>
                  </div>
                  {!id ? (
                    <>
                      <ResourceNotice loading={list.loading} error={list.error} onRetry={refresh} />
                      <div className="business-filters">
                        <label className="platform-field">
                          <span>{fr ? 'Filtrer cette page' : 'Filter this page'}</span>
                          <input
                            type="search"
                            value={query}
                            maxLength={120}
                            onChange={(event) => {
                              const next = new URLSearchParams(params);
                              next.set('q', event.target.value);
                              setParams(next, { replace: true });
                            }}
                          />
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={params.get('archived') === '1'}
                            onChange={(event) => {
                              const next = new URLSearchParams(params);
                              if (event.target.checked) next.set('archived', '1');
                              else next.delete('archived');
                              setParams(next);
                            }}
                          />
                          {fr ? 'Inclure les archives' : 'Include archives'}
                        </label>
                      </div>
                      {list.data && rows.length === 0 && (
                        <p>
                          {fr
                            ? 'Aucune fiche à afficher sur cette page.'
                            : 'No records to display on this page.'}
                        </p>
                      )}
                      {rows.length > 0 && (
                        <div
                          className="table-scroll"
                          role="region"
                          tabIndex={0}
                          aria-label={entity.label[locale]}
                        >
                          <table className="business-table">
                            <thead>
                              <tr>
                                {columns.map((column) => (
                                  <th key={column}>
                                    {entity.fields.find((field) => field.key === column)?.label[
                                      locale
                                    ] ??
                                      {
                                        totalMinor: fr ? 'Total TTC EUR' : 'Total incl. VAT EUR',
                                        customerName: fr ? 'Client' : 'Customer',
                                        productName: fr ? 'Produit' : 'Product',
                                        warehouseName: fr ? 'Entrepôt' : 'Warehouse',
                                        memberName: fr ? 'Membre' : 'Member',
                                        employeeName: fr ? 'Salarié' : 'Employee',
                                        projectName: fr ? 'Projet' : 'Project',
                                        sourceQuoteNumber: fr ? 'Devis source' : 'Source quote',
                                        fileName: fr ? 'Fichier' : 'File',
                                        size: fr ? 'Octets' : 'Bytes',
                                      }[column] ??
                                      column}
                                  </th>
                                ))}
                                <th>{fr ? 'État' : 'Status'}</th>
                                <th>{fr ? 'Action' : 'Action'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row) => (
                                <tr key={row.id}>
                                  {columns.map((column) => (
                                    <td key={column}>
                                      {column === 'totalMinor'
                                        ? formatMinor(row.data[column], locale)
                                        : String(row.data[column] ?? '—')}
                                    </td>
                                  ))}
                                  <td>{stateLabels[row.state]?.[locale] ?? row.state}</td>
                                  <td>
                                    <Button
                                      variant="text"
                                      to={`/business/${moduleKey}/${entity.key}/${row.id}`}
                                    >
                                      {fr ? 'Ouvrir' : 'Open'}
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p>
                        {fr
                          ? 'Jusqu’à 100 fiches par page. Le rapport utilise toutes les fiches.'
                          : 'Up to 100 records per page. Reports use all records.'}
                      </p>
                      <div className="row-actions">
                        {params.get('cursor') && (
                          <Button variant="secondary" onClick={() => setParams({})}>
                            {fr ? 'Première page' : 'First page'}
                          </Button>
                        )}
                        {list.data?.nextCursor && (
                          <Button
                            variant="secondary"
                            onClick={() => setParams({ cursor: list.data!.nextCursor! })}
                          >
                            {fr ? 'Page suivante' : 'Next page'}
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      {!isNew && (
                        <ResourceNotice
                          loading={detail.loading}
                          error={detail.error}
                          onRetry={refresh}
                        />
                      )}
                      {record && (
                        <>
                          <p>
                            {record.reference ?? record.id} ·{' '}
                            {stateLabels[record.state]?.[locale] ?? record.state} ·{' '}
                            {fr ? 'Révision' : 'Revision'} {record.revision}
                          </p>
                          <RecordValues record={record} definition={definition} />
                        </>
                      )}
                      {canWrite && editable && (isNew || record) && (
                        <TaskForm
                          key={`${moduleKey}/${entity.key}/${record?.id ?? 'new'}/${record?.revision ?? 0}`}
                          submit={fr ? 'Enregistrer' : 'Save'}
                          disabled={fileLoading}
                          onSave={async (form) => {
                            const values = Object.fromEntries(
                              entity.fields
                                .filter((field) => field.type !== 'file')
                                .map((field) => [field.key, String(form.get(field.key) ?? '')]),
                            );
                            const saved = await mutate(record ? `${path}/${record.id}` : path!, {
                              values,
                              ...(record ? { expectedRevision: record.revision } : {}),
                              ...(entity.key === 'quotes'
                                ? { lines: JSON.parse(String(form.get('quoteLines'))) }
                                : {}),
                              ...(file ? { file } : {}),
                            });
                            if (saved && !record)
                              navigate(`/business/${moduleKey}/${entity.key}/${saved.id}`, {
                                replace: true,
                              });
                            return false;
                          }}
                        >
                          <div className="form-columns">
                            {entity.fields
                              .filter((field) => field.type !== 'file')
                              .map((field) => (
                                <BusinessInput key={field.key} field={field} record={record} />
                              ))}
                          </div>
                          {entity.key === 'quotes' && <QuoteLines record={record} />}
                          {entity.key === 'files' && !record && (
                            <Field
                              label={fr ? 'Fichier' : 'File'}
                              name="file"
                              type="file"
                              required
                              accept="application/pdf,image/png,image/jpeg,text/plain"
                              onChange={(event) => {
                                setFile(null);
                                setFileLoading(false);
                                const generation = ++fileGeneration.current;
                                const chosen = event.currentTarget.files?.[0];
                                if (!chosen) return;
                                if (chosen.size > 49152) {
                                  setProblem({ reason: 'file_too_large' });
                                  return;
                                }
                                setFileLoading(true);
                                const reader = new FileReader();
                                reader.onload = () => {
                                  if (generation !== fileGeneration.current) return;
                                  setFile({
                                    fileName: chosen.name,
                                    mediaType: chosen.type || 'text/plain',
                                    contentBase64: String(reader.result).split(',')[1] ?? '',
                                  });
                                  setFileLoading(false);
                                };
                                reader.onerror = () => {
                                  if (generation !== fileGeneration.current) return;
                                  setProblem({ reason: 'file_invalid' });
                                  setFileLoading(false);
                                };
                                reader.readAsDataURL(chosen);
                              }}
                            />
                          )}
                        </TaskForm>
                      )}
                      {record && entity.key === 'files' && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            void platformRequest<{ contentBase64: string; fileName: string }>(
                              `${path}/${record.id}/download`,
                            )
                              .then((file) => {
                                const bytes = Uint8Array.from(
                                    atob(file.contentBase64),
                                    (character) => character.charCodeAt(0),
                                  ),
                                  url = URL.createObjectURL(
                                    new Blob([bytes], { type: 'application/octet-stream' }),
                                  ),
                                  link = document.createElement('a');
                                link.href = url;
                                link.download = file.fileName;
                                link.click();
                                URL.revokeObjectURL(url);
                              })
                              .catch(() => setProblem({}));
                          }}
                        >
                          {fr ? 'Télécharger' : 'Download'}
                        </Button>
                      )}
                      {record && actions.length > 0 && (
                        <div className="business-actions">
                          {actions.map((action) => (
                            <TaskForm
                              key={`${record.id}/${record.revision}/${action.key}`}
                              submit={action.label}
                              onSave={async (form) => {
                                if (
                                  [
                                    'archive',
                                    'reverse',
                                    'pay',
                                    'accept',
                                    'convert',
                                    'approve',
                                    'reject',
                                  ].includes(action.key) &&
                                  !window.confirm(
                                    fr ? 'Confirmer cette opération ?' : 'Confirm this operation?',
                                  )
                                )
                                  return false;
                                const updated = await mutate(`${path}/${record.id}/${action.key}`, {
                                  expectedRevision: record.revision,
                                  ...Object.fromEntries(form),
                                });
                                if (updated && updated.entity !== record.entity)
                                  navigate(
                                    `/business/${moduleKey}/${updated.entity}/${updated.id}`,
                                  );
                                return false;
                              }}
                            >
                              {action.key === 'accept' && (
                                <Field
                                  label={
                                    fr
                                      ? 'Preuve / référence de l’accord reçu'
                                      : 'Evidence / reference of acceptance'
                                  }
                                  name="acceptanceReference"
                                  required
                                  maxLength={200}
                                />
                              )}
                              {action.key === 'reverse' && (
                                <Field
                                  label={fr ? 'Motif de la compensation' : 'Reversal reason'}
                                  name="reason"
                                  required
                                  maxLength={160}
                                />
                              )}
                              {action.key === 'pay' && (
                                <>
                                  <Field
                                    label={fr ? 'Réglée le' : 'Paid on'}
                                    type="date"
                                    name="paidOn"
                                    required
                                  />
                                  <label className="platform-field">
                                    <span>{fr ? 'Moyen de règlement' : 'Payment method'}</span>
                                    <select name="method">
                                      <option value="transfer">
                                        {fr ? 'Virement' : 'Transfer'}
                                      </option>
                                      <option value="cash">{fr ? 'Espèces' : 'Cash'}</option>
                                      <option value="check">{fr ? 'Chèque' : 'Check'}</option>
                                      <option value="other">{fr ? 'Autre' : 'Other'}</option>
                                    </select>
                                  </label>
                                  <Field
                                    label={fr ? 'Référence du règlement' : 'Payment reference'}
                                    name="paymentReference"
                                    required={false}
                                  />
                                </>
                              )}
                            </TaskForm>
                          ))}
                        </div>
                      )}
                      {preview && (
                        <section className="business-print">
                          <h2>
                            {entity.key === 'invoices'
                              ? fr
                                ? 'Préparation de facture — document non fiscal'
                                : 'Invoice preparation — non-fiscal document'
                              : fr
                                ? 'Devis'
                                : 'Quote'}{' '}
                            {record.state === 'draft' ? (fr ? '· Brouillon' : '· Draft') : ''}{' '}
                            {String(record.data.number ?? '')}
                          </h2>
                          <p>
                            {fr ? 'Préparé le' : 'Prepared on'} :{' '}
                            {String(record.data.preparedOn ?? '—')} ·{' '}
                            {fr ? 'Valable jusqu’au' : 'Valid until'} :{' '}
                            {String(record.data.validUntil ?? '—')}
                          </p>
                          {entity.key === 'invoices' && (
                            <p>
                              {fr
                                ? 'Non émise · aucune transmission fiscale'
                                : 'Not issued · no fiscal transmission'}
                            </p>
                          )}
                          {['seller', 'customer'].map((key) => {
                            const party = record.data[key];
                            return party && typeof party === 'object' ? (
                              <div key={key}>
                                <h3>
                                  {key === 'seller'
                                    ? fr
                                      ? 'Émetteur'
                                      : 'Seller'
                                    : fr
                                      ? 'Client'
                                      : 'Customer'}
                                </h3>
                                {Object.entries(party as Record<string, unknown>)
                                  .filter(([key]) =>
                                    [
                                      'name',
                                      'address',
                                      'postalCode',
                                      'city',
                                      'siren',
                                      'vatNumber',
                                      'legalTerms',
                                    ].includes(key),
                                  )
                                  .map(([name, value]) => (
                                    <p key={name}>{String(value)}</p>
                                  ))}
                              </div>
                            ) : null;
                          })}
                          {Array.isArray(record.data.lines) && (
                            <div className="table-scroll">
                              <table>
                                <thead>
                                  <tr>
                                    {(fr
                                      ? ['Désignation', 'Quantité', 'Prix HT', 'TVA', 'TTC']
                                      : ['Item', 'Quantity', 'Price excl. VAT', 'VAT', 'Total']
                                    ).map((label) => (
                                      <th key={label}>{label}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {record.data.lines.map(
                                    (line: Record<string, unknown>, index: number) => (
                                      <tr key={index}>
                                        <td>
                                          {String(line.name)}
                                          {line.exemption ? (
                                            <small> · {String(line.exemption)}</small>
                                          ) : null}
                                        </td>
                                        <td>{String(line.quantity)}</td>
                                        <td>{String(line.price)} €</td>
                                        <td>{String(line.vatRate)} %</td>
                                        <td>{formatMinor(line.totalMinor, locale)}</td>
                                      </tr>
                                    ),
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <p>
                            HT : {formatMinor(record.data.netMinor, locale)} · TVA :{' '}
                            {formatMinor(record.data.vatMinor, locale)} · TTC :{' '}
                            <strong>{formatMinor(record.data.totalMinor, locale)}</strong>
                          </p>
                          <p>{String(record.data.notes ?? '')}</p>
                          <Button variant="secondary" onClick={() => window.print()}>
                            {fr ? 'Imprimer ce document' : 'Print this document'}
                          </Button>
                        </section>
                      )}
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
