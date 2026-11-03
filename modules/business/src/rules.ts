import type { BusinessEntity, BusinessProblem } from '@orkobi/sdk-types';
export class BusinessError extends Error {
  constructor(
    readonly reason: BusinessProblem,
    readonly status: 400 | 409 = 400,
    readonly field?: string,
  ) {
    super(reason);
  }
}
export const moneyLimit = 1000000000000n;
export function decimalMinor(value: unknown, scale = 2): bigint {
  if (
    typeof value !== 'string' ||
    !new RegExp(`^(?:0|[1-9][0-9]{0,10})(?:[.,][0-9]{1,${scale}})?$`, 'u').test(value)
  )
    throw new BusinessError('invalid_value');
  const [whole, decimal = ''] = value.replace(',', '.').split('.');
  const number = BigInt(whole!) * 10n ** BigInt(scale) + BigInt(decimal.padEnd(scale, '0'));
  if (number > moneyLimit) throw new BusinessError('invalid_value');
  return number;
}
export function decimalText(value: bigint, scale = 2): string {
  const base = 10n ** BigInt(scale),
    negative = value < 0n,
    absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / base}.${String(absolute % base).padStart(scale, '0')}`;
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function validateValues(entity: BusinessEntity, input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BusinessError('invalid_fields');
  const values = input as Record<string, unknown>,
    result: Record<string, string> = {};
  if (Object.keys(values).some((key) => !entity.fields.some((field) => field.key === key)))
    throw new BusinessError('invalid_fields');
  for (const field of entity.fields) {
    if (field.type === 'file') continue;
    const raw = values[field.key];
    if (raw === undefined || raw === '') {
      if (field.required) throw new BusinessError('invalid_value', 400, field.key);
      result[field.key] = '';
      continue;
    }
    if (typeof raw !== 'string') throw new BusinessError('invalid_value', 400, field.key);
    const value = raw.trim();
    if (
      value.length > (field.max ?? 160) ||
      (field.required && !value) ||
      // eslint-disable-next-line no-control-regex -- Rejet volontaire des caractères de contrôle.
      /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value)
    )
      throw new BusinessError('invalid_value', 400, field.key);
    if (
      (field.type === 'select' && !field.options?.some((option) => option.value === value)) ||
      (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) ||
      (field.type === 'date' && value && !validDate(value)) ||
      (field.type === 'reference' &&
        value &&
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value))
    )
      throw new BusinessError('invalid_value', 400, field.key);
    try {
      result[field.key] =
        field.type === 'money' && value
          ? decimalText(decimalMinor(value))
          : field.type === 'quantity'
            ? decimalText(decimalMinor(value, 3), 3)
            : value;
    } catch {
      throw new BusinessError('invalid_value', 400, field.key);
    }
  }
  for (const [start, end] of [['startDate', 'endDate']])
    if (result[start!] && result[end!] && result[start!]! > result[end!]!)
      throw new BusinessError('invalid_dates');
  if (result.country && !/^[A-Z]{2}$/u.test(result.country))
    throw new BusinessError('invalid_value', 400, 'country');
  if (result.siren && !/^\d{9}$/u.test(result.siren))
    throw new BusinessError('invalid_value', 400, 'siren');
  if (result.vatRate === '0' && !result.exemption)
    throw new BusinessError('invalid_value', 400, 'exemption');
  if (result.quantity && decimalMinor(result.quantity, 3) === 0n)
    throw new BusinessError('invalid_value', 400, 'quantity');
  return result;
}
const round = (value: bigint, divisor: bigint) => (value + divisor / 2n) / divisor;
export function quoteLine(input: {
  productId: string;
  name: string;
  unit: string;
  quantity: string;
  price: string;
  vatRate: string;
  exemption: string;
}) {
  const quantity = decimalMinor(input.quantity, 3),
    price = decimalMinor(input.price),
    rate = decimalMinor(input.vatRate);
  if (
    quantity === 0n ||
    ![0n, 210n, 550n, 1000n, 2000n].includes(rate) ||
    (rate === 0n && !input.exemption)
  )
    throw new BusinessError('invalid_value');
  const net = round(quantity * price, 1000n),
    vat = round(net * rate, 10000n);
  if (net + vat > moneyLimit) throw new BusinessError('invalid_value');
  return {
    ...input,
    quantity: decimalText(quantity, 3),
    price: decimalText(price),
    netMinor: String(net),
    vatMinor: String(vat),
    totalMinor: String(net + vat),
  };
}
export function quoteTotals(lines: readonly ReturnType<typeof quoteLine>[]) {
  if (!lines.length || lines.length > 50) throw new BusinessError('invalid_value');
  const net = lines.reduce((n, line) => n + BigInt(line.netMinor), 0n),
    vat = lines.reduce((n, line) => n + BigInt(line.vatMinor), 0n);
  if (net + vat > moneyLimit) throw new BusinessError('invalid_value');
  return {
    netMinor: String(net),
    vatMinor: String(vat),
    totalMinor: String(net + vat),
    currency: 'EUR' as const,
  };
}
