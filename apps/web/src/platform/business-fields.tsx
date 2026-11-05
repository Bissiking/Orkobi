import { businessUi } from './business-copy';
import { useState, useId, useMemo } from 'react';
import { Button, Notice } from '@orkobi/sdk-ui';
import { Field } from './components';
import { Select, TextArea } from '@orkobi/sdk-ui';
import { Plus, Trash2 } from 'lucide-react';
import type { BusinessField, BusinessModuleKey, BusinessRecord } from '@orkobi/contracts';
import { quoteLine, quoteTotals } from '@orkobi/module-business';
import { usePreferences } from '../preferences-context';
import { useReference } from './business/use-reference';
import { formatMinor } from './business-copy';
export function BusinessReference({
  field,
  reference,
  name,
  initial = '',
  initialLabel,
  value,
  onChange,
  invalid = false,
}: {
  field: BusinessField;
  reference: { readonly module: BusinessModuleKey; readonly entity: string };
  name: string;
  initial?: string;
  initialLabel?: string;
  value?: string;
  onChange?: (value: string) => void;
  invalid?: boolean;
}) {
  const { locale } = usePreferences(),
    id = useId(),
    resource = useReference(reference.module, reference.entity),
    [selection, setSelection] = useState(initial);
  const available = resource.records.filter(
    (record) => !['archived', 'done'].includes(record.state),
  );
  const current = value ?? selection,
    existing = current && !available.some((record) => record.id === current);
  return (
    <div className="platform-field">
      <label htmlFor={id}>
        {field.label[locale]}
        {field.required ? ' *' : ''}
      </label>
      <select
        id={id}
        name={name}
        required={field.required}
        value={current}
        aria-invalid={invalid || undefined}
        aria-describedby={resource.error ? `${id}-error` : undefined}
        onChange={(event) => {
          setSelection(event.target.value);
          onChange?.(event.target.value);
        }}
      >
        <option value="">
          {resource.loading && !resource.records.length
            ? businessUi.loading[locale]
            : businessUi.select[locale]}
        </option>
        {existing && <option value={current}>{initialLabel || current}</option>}
        {available.map((record) => (
          <option key={record.id} value={record.id}>
            {String(record.data.name ?? record.data.title ?? record.data.number ?? record.id)}
            {record.data.sku ? ` · ${String(record.data.sku)}` : ''}
          </option>
        ))}
      </select>
      {resource.cursor && (
        <Button variant="text" onClick={() => void resource.more()} disabled={resource.loading}>
          {resource.loading ? businessUi.loading[locale] : businessUi.loadMoreReferences[locale]}
        </Button>
      )}
      {resource.error && (
        <Notice tone="error">
          <p id={`${id}-error`}>{businessUi.referencesUnavailable[locale]}</p>
          <Button variant="text" onClick={() => void resource.retry()}>
            {businessUi.retry[locale]}
          </Button>
        </Notice>
      )}
    </div>
  );
}
export function BusinessInput({
  field,
  record,
  invalid = false,
}: {
  field: BusinessField;
  record: BusinessRecord | null;
  invalid?: boolean;
}) {
  const { locale } = usePreferences(),
    raw = record?.data[field.key],
    defaults: Record<string, string> = {
      country: 'FR',
      unit: businessUi.unit[locale],
      vatRate: '20',
      quantity: '1.000',
      kind: 'company',
      stage: 'prospect',
    },
    value = typeof raw === 'string' ? raw : (defaults[field.key] ?? ''),
    label = `${field.label[locale]}${field.required ? ' *' : ''}`;
  if (field.type === 'reference' && field.reference)
    return (
      <BusinessReference
        field={field}
        reference={field.reference}
        name={field.key}
        initial={value}
        initialLabel={String(record?.data[field.key.replace(/Id$/u, 'Name')] ?? '')}
        invalid={invalid}
      />
    );
  if (field.type === 'select')
    return (
      <Select
        label={label}
        name={field.key}
        required={field.required}
        aria-invalid={invalid || undefined}
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
      </Select>
    );
  if (field.type === 'textarea')
    return (
      <TextArea
        label={label}
        name={field.key}
        required={field.required}
        maxLength={field.max ?? 160}
        defaultValue={value}
        rows={field.key === 'legalTerms' ? 5 : 3}
        aria-invalid={invalid || undefined}
      />
    );
  return (
    <Field
      label={label}
      name={field.key}
      required={field.required ?? false}
      value={value}
      type={field.type === 'money' || field.type === 'quantity' ? 'text' : field.type}
      maxLength={field.max ?? 160}
      aria-invalid={invalid || undefined}
      {...(field.type === 'money' || field.type === 'quantity'
        ? { inputMode: 'decimal' as const, placeholder: businessUi.decimalPlaceholder[locale] }
        : {})}
      {...(field.key === 'exemption'
        ? {
            help: businessUi.requiredForAZeroVATRate[locale],
          }
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
const productField = {
  key: 'productId',
  label: { fr: 'Produit / service', en: 'Product / service' },
  type: 'reference',
  required: true,
  reference: { module: 'products', entity: 'products' },
} as const satisfies BusinessField;
export function QuoteLines({
  record,
  onDirty,
}: {
  record: BusinessRecord | null;
  onDirty: () => void;
}) {
  const { locale } = usePreferences(),
    products = useReference('products', 'products');
  const source = Array.isArray(record?.data.lines)
    ? (record.data.lines as Record<string, unknown>[])
    : [];
  const [lines, setLines] = useState<QuoteRow[]>(() =>
    source.length
      ? source.map((line) => ({
          rowKey: crypto.randomUUID(),
          productId: String(line.productId),
          quantity: String(line.quantity),
          price: String(line.price),
        }))
      : [{ rowKey: crypto.randomUUID(), productId: '', quantity: '1.000', price: '' }],
  );
  const productMap = useMemo(
    () => new Map(products.records.map((product) => [product.id, product.data])),
    [products.records],
  );
  const calculation = useMemo(() => {
    try {
      const estimated = lines.map((line) => {
        const product =
          productMap.get(line.productId) ??
          source.find((item) => item.productId === line.productId);
        if (!product) throw new Error();
        return quoteLine({
          productId: line.productId,
          name: String(product.name),
          unit: String(product.unit ?? ''),
          quantity: line.quantity,
          price: line.price || String(product.price),
          vatRate: String(product.vatRate),
          exemption: String(product.exemption ?? ''),
        });
      });
      return quoteTotals(estimated);
    } catch {
      return null;
    }
  }, [lines, productMap, record]);
  const change = (rowKey: string, values: Partial<QuoteRow>) =>
    setLines((old) => old.map((line) => (line.rowKey === rowKey ? { ...line, ...values } : line)));
  return (
    <section className="business-lines">
      <div className="business-subheading">
        <h2>{businessUi.quoteLines[locale]}</h2>
        <span>{lines.length} / 50</span>
      </div>
      {lines.map((line, index) => {
        const product = productMap.get(line.productId),
          initialLabel = String(
            product?.name ?? source.find((item) => item.productId === line.productId)?.name ?? '',
          );
        return (
          <div className="business-line" key={line.rowKey}>
            <BusinessReference
              field={productField}
              reference={productField.reference}
              name={`product_${index}`}
              initial={line.productId}
              initialLabel={initialLabel}
              value={line.productId}
              onChange={(productId) => change(line.rowKey, { productId, price: '' })}
            />
            <label className="platform-field">
              <span>{businessUi.quantityRequired[locale]}</span>
              <input
                name={`quantity_${index}`}
                value={line.quantity}
                required
                inputMode="decimal"
                maxLength={20}
                onChange={(event) => change(line.rowKey, { quantity: event.target.value })}
              />
            </label>
            <label className="platform-field">
              <span>{businessUi.priceExclVATEUR[locale]}</span>
              <input
                name={`price_${index}`}
                value={line.price}
                placeholder={String(product?.price ?? businessUi.catalogPrice[locale])}
                inputMode="decimal"
                maxLength={20}
                onChange={(event) => change(line.rowKey, { price: event.target.value })}
              />
              <small>{businessUi.blankCatalogPrice[locale]}</small>
            </label>
            <Button
              variant="icon"
              disabled={lines.length === 1}
              aria-label={`${businessUi.removeLine[locale]} ${index + 1}`}
              onClick={() => {
                onDirty();
                setLines((old) => old.filter((item) => item.rowKey !== line.rowKey));
              }}
            >
              <Trash2 size={18} />
            </Button>
          </div>
        );
      })}
      <input
        type="hidden"
        name="quoteLines"
        value={JSON.stringify(
          lines.map(({ productId, quantity, price }) => ({ productId, quantity, price })),
        )}
      />
      <div className="business-quote-footer">
        <Button
          variant="secondary"
          disabled={lines.length >= 50}
          onClick={() => {
            onDirty();
            setLines((old) => [
              ...old,
              { rowKey: crypto.randomUUID(), productId: '', quantity: '1.000', price: '' },
            ]);
          }}
        >
          <Plus size={16} />
          {businessUi.addLine[locale]}
        </Button>
        <div className="business-quote-estimate" aria-live="polite">
          {calculation ? (
            <>
              <span>
                {businessUi.exclVAT[locale]} {formatMinor(calculation.netMinor, locale)}
              </span>
              <span>
                {businessUi.vat[locale]} {formatMinor(calculation.vatMinor, locale)}
              </span>
              <strong>
                {businessUi.totalInclVAT[locale]} {formatMinor(calculation.totalMinor, locale)}
              </strong>
              <small>{businessUi.estimateNotice[locale]}</small>
            </>
          ) : (
            <small>{businessUi.estimateIncomplete[locale]}</small>
          )}
        </div>
      </div>
    </section>
  );
}
