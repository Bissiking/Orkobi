import { useEffect, useState, useId } from 'react';
import type { ChangeEvent } from 'react';
import { Button, Field, Notice } from '@orkobi/sdk-ui';
import type { BusinessField, BusinessRecord, BusinessList } from '@orkobi/contracts';
import { usePreferences } from '../preferences-context';
import { platformRequest } from './api';
export function BusinessReference({
  field,
  name,
  initial = '',
  value,
  onChange,
}: {
  field: BusinessField;
  name: string;
  initial?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const { locale } = usePreferences(),
    fr = locale === 'fr',
    reference = field.reference!;
  const [selection, setSelection] = useState(initial);
  const [records, setRecords] = useState<BusinessRecord[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false);
  const load = async (next?: string) => {
    setLoading(true);
    setFailed(false);
    try {
      const page = await platformRequest<BusinessList>(
        `business/${reference.module}/${reference.entity}${next ? `?cursor=${encodeURIComponent(next)}` : ''}`,
      );
      setRecords((old) => (next ? [...old, ...page.records] : [...page.records]));
      setCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let live = true;
    setLoading(true);
    void platformRequest<BusinessList>(`business/${reference.module}/${reference.entity}`)
      .then((page) => {
        if (live) {
          setRecords([...page.records]);
          setCursor(page.nextCursor);
          setFailed(false);
        }
      })
      .catch(() => {
        if (live) setFailed(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [reference.module, reference.entity]);
  const selectId = useId();
  const existing = initial && !records.some((record) => record.id === initial);
  return (
    <div className="platform-field">
      <label htmlFor={selectId}>
        {field.label[locale]}
        {field.required ? ' *' : ''}
      </label>
      <select
        id={selectId}
        name={name}
        required={field.required}
        value={value ?? selection}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          setSelection(event.target.value);
          onChange?.(event.target.value);
        }}
      >
        <option value="">
          {loading ? (fr ? 'Chargement…' : 'Loading…') : fr ? 'Sélectionner' : 'Select'}
        </option>
        {existing && <option value={initial}>{initial}</option>}
        {records
          .filter((record) => record.state !== 'archived')
          .map((record) => (
            <option key={record.id} value={record.id}>
              {String(record.data.name ?? record.data.title ?? record.data.number ?? record.id)}
              {record.data.sku ? ` · ${String(record.data.sku)}` : ''}
            </option>
          ))}
      </select>
      {cursor && (
        <Button variant="text" onClick={() => void load(cursor)} disabled={loading}>
          {fr ? 'Charger d’autres références' : 'Load more references'}
        </Button>
      )}
      {failed && (
        <Notice tone="error">
          {fr
            ? 'Références indisponibles : vérifiez les modules actifs et vos droits.'
            : 'References unavailable: check active modules and your permissions.'}
          <Button variant="text" onClick={() => void load()}>
            {fr ? 'Réessayer' : 'Retry'}
          </Button>
        </Notice>
      )}
    </div>
  );
}
export function BusinessInput({
  field,
  record,
}: {
  field: BusinessField;
  record: BusinessRecord | null;
}) {
  const { locale } = usePreferences();
  const raw = record?.data[field.key];
  const defaults: Record<string, string> = {
    country: 'FR',
    unit: locale === 'fr' ? 'unité' : 'unit',
    vatRate: '20',
    quantity: '1.000',
    kind: 'company',
    stage: 'prospect',
  };
  const value = typeof raw === 'string' ? raw : (defaults[field.key] ?? '');
  if (field.type === 'reference')
    return <BusinessReference field={field} name={field.key} initial={value} />;
  if (field.type === 'select')
    return (
      <label className="platform-field">
        <span>
          {field.label[locale]}
          {field.required ? ' *' : ''}
        </span>
        <select
          name={field.key}
          required={field.required}
          defaultValue={
            field.options?.some((option) => option.value === value)
              ? value
              : field.options?.[0]?.value
          }
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label[locale]}
            </option>
          ))}
        </select>
      </label>
    );
  if (field.type === 'textarea')
    return (
      <label className="platform-field">
        <span>
          {field.label[locale]}
          {field.required ? ' *' : ''}
        </span>
        <textarea
          name={field.key}
          required={field.required}
          maxLength={field.max ?? 160}
          defaultValue={value}
          rows={4}
        />
      </label>
    );
  return (
    <Field
      label={field.label[locale]}
      name={field.key}
      required={field.required ?? false}
      value={value}
      type={field.type === 'money' || field.type === 'quantity' ? 'text' : field.type}
      maxLength={field.max ?? 160}
      {...(field.type === 'money' || field.type === 'quantity'
        ? { inputMode: 'decimal' as const, placeholder: '0.00' }
        : {})}
    />
  );
}
interface QuoteRow {
  rowKey: string;
  productId: string;
  quantity: string;
  price: string;
}
export function QuoteLines({ record }: { record: BusinessRecord | null }) {
  const { locale } = usePreferences(),
    fr = locale === 'fr';
  const source = Array.isArray(record?.data.lines) ? (record.data.lines as QuoteRow[]) : [];
  const [lines, setLines] = useState<QuoteRow[]>(
    source.length
      ? source.map((line) => ({
          rowKey: crypto.randomUUID(),
          productId: line.productId,
          quantity: line.quantity,
          price: line.price,
        }))
      : [{ rowKey: crypto.randomUUID(), productId: '', quantity: '1.000', price: '' }],
  );
  const product: BusinessField = {
    key: 'productId',
    label: { fr: 'Produit / service', en: 'Product / service' },
    type: 'reference',
    required: true,
    reference: { module: 'products', entity: 'products' },
  };
  return (
    <section className="business-lines">
      <h3>{fr ? 'Lignes du devis' : 'Quote lines'}</h3>
      {lines.map((line, index) => (
        <div className="business-line" key={line.rowKey}>
          <BusinessReference
            field={product}
            name={`product_${index}`}
            initial={line.productId}
            value={line.productId}
            onChange={(value) =>
              setLines((old) =>
                old.map((item, i) => (i === index ? { ...item, productId: value } : item)),
              )
            }
          />
          <Field
            label={fr ? 'Quantité' : 'Quantity'}
            name={`quantity_${index}`}
            value={line.quantity}
            required
            inputMode="decimal"
            onChange={(event) =>
              setLines((old) =>
                old.map((item, i) =>
                  i === index ? { ...item, quantity: event.target.value } : item,
                ),
              )
            }
          />
          <Field
            label={fr ? 'Prix HT EUR (vide = catalogue)' : 'Price excl. VAT EUR (blank = catalog)'}
            name={`price_${index}`}
            value={line.price}
            required={false}
            inputMode="decimal"
            onChange={(event) =>
              setLines((old) =>
                old.map((item, i) => (i === index ? { ...item, price: event.target.value } : item)),
              )
            }
          />
          <Button
            variant="text"
            disabled={lines.length === 1}
            onClick={() => setLines((old) => old.filter((_, i) => i !== index))}
          >
            {fr ? 'Retirer la ligne' : 'Remove line'}
          </Button>
        </div>
      ))}
      <input
        type="hidden"
        name="quoteLines"
        value={JSON.stringify(
          lines.map(({ productId, quantity, price }) => ({ productId, quantity, price })),
        )}
      />
      <Button
        variant="secondary"
        disabled={lines.length >= 50}
        onClick={() =>
          setLines((old) => [
            ...old,
            { rowKey: crypto.randomUUID(), productId: '', quantity: '1.000', price: '' },
          ])
        }
      >
        {fr ? 'Ajouter une ligne' : 'Add line'}
      </Button>
    </section>
  );
}
