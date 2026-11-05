import { businessUi } from '../business-copy';
import type { BusinessRecord } from '@orkobi/contracts';
import { usePreferences } from '../../preferences-context';
import { formatMinor } from '../business-copy';
import { DataTable, Th } from '@orkobi/sdk-ui';
export function BusinessDocument({ record }: { record: BusinessRecord }) {
  const { locale } = usePreferences(),
    fr = locale === 'fr';
  return (
    <section className="business-print">
      <h2>
        {record.entity === 'invoices'
          ? businessUi.invoicePreparationNonFiscalDocument[locale]
          : businessUi.quote[locale]}{' '}
        {record.state === 'draft' ? businessUi.draft[locale] : ''}{' '}
        {String(record.data.number ?? '')}
      </h2>
      <p>
        {businessUi.preparedOn[locale]} : {String(record.data.preparedOn ?? '—')} ·{' '}
        {businessUi.validUntil[locale]} : {String(record.data.validUntil ?? '—')}
      </p>
      {record.entity === 'invoices' && <p>{businessUi.notIssuedNoFiscalTransmission[locale]}</p>}
      {['seller', 'customer'].map((key) => {
        const party = record.data[key];
        return party && typeof party === 'object' ? (
          <div key={key}>
            <h3>{key === 'seller' ? businessUi.seller[locale] : businessUi.customer[locale]}</h3>
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
        <DataTable
          label={businessUi.documentLines[locale]}
          tableClassName="business-document-lines"
        >
          <thead>
            <tr>
              {(fr
                ? ['Désignation', 'Quantité', 'Prix HT', 'TVA', 'TTC']
                : ['Item', 'Quantity', 'Price excl. VAT', 'VAT', 'Total']
              ).map((label) => (
                <Th key={label}>{label}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {record.data.lines.map((line: Record<string, unknown>, index: number) => (
              <tr key={index}>
                <td data-label={businessUi.item[locale]}>
                  {String(line.name)}
                  {line.exemption ? <small> · {String(line.exemption)}</small> : null}
                </td>
                <td data-label={businessUi.quantity[locale]}>{String(line.quantity)}</td>
                <td data-label={businessUi.priceExclVAT[locale]}>{String(line.price)} €</td>
                <td data-label={businessUi.vat[locale]}>{String(line.vatRate)} %</td>
                <td data-label={businessUi.total[locale]}>
                  {formatMinor(line.totalMinor, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <p>
        {businessUi.exclVAT[locale]} : {formatMinor(record.data.netMinor, locale)} ·{' '}
        {businessUi.vat[locale]} : {formatMinor(record.data.vatMinor, locale)} ·{' '}
        {businessUi.inclVAT[locale]} :{' '}
        <strong>{formatMinor(record.data.totalMinor, locale)}</strong>
      </p>
      <p>{String(record.data.notes ?? '')}</p>
    </section>
  );
}
