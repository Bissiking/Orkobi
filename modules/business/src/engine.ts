import type { BusinessPort } from '@orkobi/sdk-core';
import type { BusinessModuleKey, BusinessRecord } from '@orkobi/sdk-types';
import { businessDefinition } from './definitions.js';
import {
  BusinessError,
  decimalMinor,
  decimalText,
  validDate,
  validateValues,
  quoteLine,
  quoteTotals,
} from './rules.js';
type Body = Record<string, unknown>;
const text = (value: unknown, max = 500) => {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    // eslint-disable-next-line no-control-regex -- Rejet volontaire des caractères de contrôle.
    /[\u0000-\u001f]/u.test(value)
  )
    throw new BusinessError('invalid_value');
  return value.trim();
};
function revision(body: Body, current: BusinessRecord) {
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision !== current.revision)
    throw new BusinessError('revision_conflict', 409);
}
function transition(current: BusinessRecord, ...allowed: string[]) {
  if (!allowed.includes(current.state)) throw new BusinessError('invalid_transition', 409);
}
async function update(
  port: BusinessPort,
  record: BusinessRecord,
  data: Record<string, unknown>,
  state = record.state,
) {
  return port.put(record.entity, {
    id: record.id,
    revision: record.revision,
    data,
    state,
    reference: record.reference,
    parentId: record.parentId,
  });
}
const active = (record: BusinessRecord) => {
  if (record.state === 'archived' || record.state === 'cancelled' || record.state === 'done')
    throw new BusinessError('invalid_reference', 409);
  return record;
};
async function references(
  port: BusinessPort,
  module: BusinessModuleKey,
  entity: string,
  values: Record<string, string>,
) {
  const definition = businessDefinition(module)!.entities.find((e) => e.key === entity)!,
    data: Record<string, unknown> = { ...values };
  let parentId: string | null = null;
  for (const field of definition.fields) {
    if (!field.reference || !values[field.key]) continue;
    const target = active(
      await port.get(field.reference.module, field.reference.entity, values[field.key]!),
    );
    parentId ??= target.id;
    const name = target.data.name ?? target.data.title ?? target.reference ?? target.id;
    data[field.key.replace(/Id$/u, 'Name')] = name;
    if (module === 'stock' && field.key === 'productId' && target.data.kind !== 'goods')
      throw new BusinessError('invalid_reference', 409);
    if (
      module === 'hr' &&
      entity === 'leave' &&
      field.key === 'employeeId' &&
      (String(values.startDate) < String(target.data.startDate) ||
        (target.data.endDate && String(values.endDate) > String(target.data.endDate)))
    )
      throw new BusinessError('invalid_dates');
  }
  return { data, parentId };
}
export async function saveBusiness(
  port: BusinessPort,
  module: BusinessModuleKey,
  entity: string,
  body: Body,
  id?: string,
) {
  const declaration = businessDefinition(module)?.entities.find((e) => e.key === entity);
  if (!declaration || declaration.readOnly) throw new BusinessError('invalid_fields');
  const current = id ? await port.get(module, entity, id) : undefined;
  if (current) {
    revision(body, current);
    if (
      entity === 'movements' ||
      (entity === 'quotes' && current.state !== 'draft') ||
      (entity === 'dues' && current.state !== 'pending') ||
      (entity === 'leave' && current.state !== 'requested') ||
      current.state === 'archived' ||
      current.state === 'done'
    )
      throw new BusinessError('invalid_transition', 409);
  }
  const values = validateValues(declaration, body.values),
    linked = await references(port, module, entity, values),
    data = linked.data;
  if (
    module === 'products' &&
    current &&
    current.data.kind !== values.kind &&
    (await port.stockHeld(current.id))
  )
    throw new BusinessError('invalid_transition', 409);
  if (module === 'hr' && entity === 'employees' && current) {
    const approved = (await port.related('hr', 'leave', current.id)).filter(
      (leave) => leave.state === 'approved',
    );
    if (
      approved.some(
        (leave) =>
          String(leave.data.startDate) < String(values.startDate) ||
          (values.endDate && String(leave.data.endDate) > values.endDate),
      )
    )
      throw new BusinessError('invalid_dates', 409);
  }
  if (entity === 'quotes') {
    if (!validDate(values.validUntil) || values.validUntil < port.today)
      throw new BusinessError('invalid_dates');
    if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 50)
      throw new BusinessError('invalid_fields');
    const lines = [];
    for (const raw of body.lines) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new BusinessError('invalid_fields');
      const line = raw as Body;
      if (Object.keys(line).some((key) => !['productId', 'quantity', 'price'].includes(key)))
        throw new BusinessError('invalid_fields');
      const product = active(await port.get('products', 'products', text(line.productId, 36)));
      lines.push(
        quoteLine({
          productId: product.id,
          name: String(product.data.name),
          unit: String(product.data.unit),
          quantity: text(line.quantity, 20),
          price:
            line.price === undefined || line.price === ''
              ? String(product.data.price)
              : text(line.price, 20),
          vatRate: String(product.data.vatRate),
          exemption: String(product.data.exemption ?? ''),
        }),
      );
    }
    Object.assign(data, { lines, ...quoteTotals(lines) });
  }
  let reference: string | null = current?.reference ?? null;
  if (['products', 'warehouses', 'projects', 'members', 'employees'].includes(entity)) {
    const codeField =
      entity === 'products'
        ? 'sku'
        : ['warehouses', 'projects'].includes(entity)
          ? 'code'
          : 'number';
    const code = String(values[codeField]).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._/-]{0,59}$/u.test(code))
      throw new BusinessError('invalid_value', 400, codeField);
    data[codeField] = code;
    reference = code;
  }
  if (entity === 'profile') {
    reference = 'PROFILE';
    if (!/^\d{9}$/u.test(String(values.siren)))
      throw new BusinessError('invalid_value', 400, 'siren');
  }
  if (entity === 'dues') {
    if (decimalMinor(values.amount) === 0n) throw new BusinessError('invalid_value', 400, 'amount');
    const period = text(values.period, 40).normalize('NFKC').toUpperCase();
    if (period.length > 40) throw new BusinessError('invalid_value', 400, 'period');
    // Clé ASCII bijective bornée à 197 caractères, identique sur les trois moteurs.
    reference = `${values.memberId}/${period
      .split('')
      .map((character) => character.charCodeAt(0).toString(16).padStart(4, '0'))
      .join('')}`;
  }
  if (reference) {
    const duplicate = await port.byReference(module, entity, reference);
    if (duplicate && duplicate.id !== current?.id)
      throw new BusinessError('duplicate_reference', 409);
  }
  if (entity === 'projects' && values.budget) decimalMinor(values.budget);
  const state =
    current?.state ??
    (entity === 'quotes'
      ? 'draft'
      : entity === 'dues'
        ? 'pending'
        : entity === 'tasks'
          ? 'todo'
          : entity === 'leave'
            ? 'requested'
            : entity === 'movements'
              ? 'posted'
              : 'active');
  let file;
  if (entity === 'files') {
    if (current && body.file) throw new BusinessError('invalid_transition', 409);
    if (!current) {
      file = await port.prepareFile(body.file);
      Object.assign(data, {
        fileName: file.fileName,
        size: file.size,
        sha256: file.sha256,
        mediaType: file.mediaType,
      });
    } else
      Object.assign(data, {
        fileName: current.data.fileName,
        size: current.data.size,
        sha256: current.data.sha256,
        mediaType: current.data.mediaType,
      });
  }
  if (entity === 'movements') return movement(port, values, linked.data);
  const saved = await port.put(entity, {
    id: current?.id ?? port.uuid(),
    data,
    state,
    reference,
    parentId: linked.parentId,
    ...(current ? { revision: current.revision } : {}),
  });
  if (file) await port.attach(saved.id, file);
  return saved;
}
async function movement(
  port: BusinessPort,
  values: Record<string, string>,
  data: Record<string, unknown>,
  reverseOf?: BusinessRecord,
) {
  const reference = `${values.productId}/${values.warehouseId}`,
    balance = await port.byReference('stock', 'balances', reference),
    old = BigInt(String(balance?.data.quantityMilli ?? '0')),
    delta = decimalMinor(values.quantity, 3) * (values.direction === 'in' ? 1n : -1n),
    next = old + delta;
  if (next < 0n) throw new BusinessError('insufficient_stock', 409);
  await port.put('balances', {
    id: balance?.id ?? port.uuid(),
    data: {
      productId: values.productId,
      warehouseId: values.warehouseId,
      productName: data.productName,
      warehouseName: data.warehouseName,
      quantityMilli: String(next),
      quantity: decimalText(next, 3),
    },
    state: 'active',
    reference,
    parentId: values.productId!,
    ...(balance ? { revision: balance.revision } : {}),
  });
  return port.put('movements', {
    id: port.uuid(),
    data: {
      ...data,
      quantity: decimalText(decimalMinor(values.quantity, 3), 3),
      ...(reverseOf ? { reversesId: reverseOf.id } : {}),
    },
    state: 'posted',
    parentId: values.productId!,
  });
}
export async function actBusiness(
  port: BusinessPort,
  module: BusinessModuleKey,
  entity: string,
  id: string,
  action: string,
  body: Body,
) {
  const current = await port.get(module, entity, id);
  revision(body, current);
  if (action === 'archive') {
    if (
      current.state === 'archived' ||
      (module === 'hr' && entity === 'leave' && current.state === 'approved') ||
      ['movements', 'balances', 'invoices', 'profile'].includes(entity) ||
      (entity === 'quotes' && current.state !== 'draft') ||
      (entity === 'dues' && current.state === 'paid')
    )
      throw new BusinessError('invalid_transition', 409);
    if (
      (entity === 'products' && (await port.stockHeld(id))) ||
      (entity === 'warehouses' && (await port.stockHeld('', id)))
    )
      throw new BusinessError('invalid_transition', 409);
    if (
      entity === 'projects' &&
      (await port.related('projects', 'tasks', id)).some(
        (task) => task.state !== 'done' && task.state !== 'archived',
      )
    )
      throw new BusinessError('project_has_open_tasks', 409);
    if (
      entity === 'members' &&
      (await port.related('members', 'dues', id)).some((due) => due.state === 'pending')
    )
      throw new BusinessError('invalid_transition', 409);
    return update(port, current, { ...current.data }, 'archived');
  }
  if (module === 'sales' && entity === 'quotes') {
    if (action === 'prepare') {
      transition(current, 'draft');
      if (String(current.data.validUntil) < port.today)
        throw new BusinessError('quote_expired', 409);
      const profile = await port.byReference('sales', 'profile', 'PROFILE');
      if (!profile || profile.state !== 'active') throw new BusinessError('profile_required', 409);
      const customer = active(await port.get('crm', 'contacts', String(current.data.customerId)));
      if (!customer.data.address || !customer.data.city || !customer.data.postalCode)
        throw new BusinessError('invalid_reference', 409);
      const number = await port.number(`DEV-${port.today.slice(0, 4)}`);
      return port.put(entity, {
        id,
        revision: current.revision,
        reference: number,
        parentId: current.parentId,
        state: 'prepared',
        data: {
          ...current.data,
          number,
          preparedOn: port.today,
          seller: { ...profile.data },
          customer: { ...customer.data },
        },
      });
    }
    if (action === 'accept') {
      transition(current, 'prepared');
      if (String(current.data.validUntil) < port.today)
        throw new BusinessError('quote_expired', 409);
      return update(
        port,
        current,
        {
          ...current.data,
          acceptedOn: port.today,
          acceptanceReference: text(body.acceptanceReference, 200),
        },
        'accepted',
      );
    }
    if (action === 'reject') {
      transition(current, 'prepared');
      return update(port, current, { ...current.data }, 'rejected');
    }
    if (action === 'convert') {
      transition(current, 'accepted');
      const invoice = await port.put('invoices', {
        id: port.uuid(),
        data: {
          ...current.data,
          sourceQuoteId: id,
          sourceQuoteNumber: current.data.number,
          number: `PREP-${String(current.data.number)}`,
          fiscal: false,
          transmission: 'provider_required',
        },
        state: 'prepared',
        reference: `QUOTE/${id}`,
        parentId: id,
      });
      await update(port, current, { ...current.data, invoiceId: invoice.id }, 'converted');
      return invoice;
    }
  }
  if (entity === 'invoices' && action === 'issue')
    throw new BusinessError('billing_provider_required', 409);
  if (module === 'stock' && entity === 'movements' && action === 'reverse') {
    if (current.state !== 'posted' || current.data.reversesId)
      throw new BusinessError('already_reversed', 409);
    const data: Record<string, unknown> = {
      ...current.data,
      direction: current.data.direction === 'in' ? 'out' : 'in',
      reason: text(body.reason, 160),
    };
    // Une compensation ne doit pas restaurer de stock sur une référence archivée
    // ou contourner le droit courant de lire le catalogue.
    await references(port, 'stock', 'movements', {
      productId: String(data.productId),
      warehouseId: String(data.warehouseId),
    });
    const reversal = await movement(
      port,
      {
        productId: String(data.productId),
        warehouseId: String(data.warehouseId),
        quantity: String(data.quantity),
        direction: String(data.direction),
        reason: String(data.reason),
      },
      data,
      current,
    );
    await update(port, current, { ...current.data, reversalId: reversal.id }, 'reversed');
    return reversal;
  }
  if (module === 'projects' && action === 'complete') {
    transition(
      current,
      entity === 'tasks' ? 'todo' : 'active',
      entity === 'tasks' ? 'doing' : 'active',
    );
    if (
      entity === 'projects' &&
      (await port.related('projects', 'tasks', id)).some(
        (task) => !['done', 'archived'].includes(task.state),
      )
    )
      throw new BusinessError('project_has_open_tasks', 409);
    if (entity === 'tasks')
      active(await port.get('projects', 'projects', String(current.data.projectId)));
    return update(port, current, { ...current.data }, 'done');
  }
  if (module === 'projects' && entity === 'tasks' && action === 'start') {
    transition(current, 'todo');
    active(await port.get('projects', 'projects', String(current.data.projectId)));
    return update(port, current, { ...current.data }, 'doing');
  }
  if (module === 'projects' && action === 'reopen') {
    transition(current, 'done');
    if (entity === 'tasks')
      active(await port.get('projects', 'projects', String(current.data.projectId)));
    return update(port, current, { ...current.data }, entity === 'tasks' ? 'todo' : 'active');
  }
  if (module === 'members' && entity === 'dues' && action === 'pay') {
    transition(current, 'pending');
    if (
      !validDate(body.paidOn) ||
      body.paidOn > port.today ||
      !['transfer', 'cash', 'check', 'other'].includes(String(body.method))
    )
      throw new BusinessError('invalid_value');
    return update(
      port,
      current,
      {
        ...current.data,
        paidOn: body.paidOn,
        method: body.method,
        paymentReference: body.paymentReference ? text(body.paymentReference, 160) : '',
      },
      'paid',
    );
  }
  if (module === 'hr' && entity === 'leave' && ['approve', 'reject'].includes(action)) {
    transition(current, 'requested');
    if (action === 'approve') {
      const employee = active(await port.get('hr', 'employees', String(current.data.employeeId)));
      if (
        String(current.data.startDate) < String(employee.data.startDate) ||
        (employee.data.endDate && String(current.data.endDate) > String(employee.data.endDate))
      )
        throw new BusinessError('invalid_dates');
      const others = await port.related('hr', 'leave', employee.id);
      if (
        others.some(
          (other) =>
            other.id !== id &&
            other.state === 'approved' &&
            String(other.data.startDate) <= String(current.data.endDate) &&
            String(other.data.endDate) >= String(current.data.startDate),
        )
      )
        throw new BusinessError('invalid_dates', 409);
    }
    return update(
      port,
      current,
      { ...current.data, decidedOn: port.today },
      action === 'approve' ? 'approved' : 'rejected',
    );
  }
  throw new BusinessError('invalid_transition', 409);
}
