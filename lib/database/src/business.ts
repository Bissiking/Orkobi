import type { BusinessModuleKey, BusinessRecord } from '@orkobi/contracts';
import type { SqlClient } from './connection.js';
interface Row {
  id: string;
  moduleId: string;
  entity: string;
  data: Record<string, unknown>;
  state: string;
  reference: string | null;
  parentId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
const columns =
  'id,module_id AS "moduleId",entity,data,state,reference_key AS "reference",parent_id AS "parentId",revision,created_at::text AS "createdAt",updated_at::text AS "updatedAt"';
const record = ({ moduleId, ...row }: Row): BusinessRecord => ({
  ...row,
  module: moduleId.slice(7) as BusinessModuleKey,
});
/** Infrastructure privée ; tous les accès incluent une organisation fixée par le Core. */
export class BusinessRepository {
  constructor(private readonly client: SqlClient) {}
  async get(organizationId: string, id: string) {
    const row = (
      await this.client.query<Row>(
        `SELECT ${columns} FROM orkobi_business.records WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
        [organizationId, id],
      )
    ).rows[0];
    return row ? record(row) : undefined;
  }
  async byReference(
    organizationId: string,
    module: BusinessModuleKey,
    entity: string,
    reference: string,
  ) {
    const row = (
      await this.client.query<Row>(
        `SELECT ${columns} FROM orkobi_business.records WHERE organization_id=$1 AND module_id=$2 AND entity=$3 AND reference_key=$4 FOR UPDATE`,
        [organizationId, `orkobi.${module}`, entity, reference],
      )
    ).rows[0];
    return row ? record(row) : undefined;
  }
  async list(organizationId: string, module: BusinessModuleKey, entity: string, cursor?: string) {
    const rows = (
      await this.client.query<Row>(
        `SELECT ${columns} FROM orkobi_business.records WHERE organization_id=$1 AND module_id=$2 AND entity=$3 ${cursor ? 'AND id>$4' : ''} ORDER BY id LIMIT 101`,
        [organizationId, `orkobi.${module}`, entity, ...(cursor ? [cursor] : [])],
      )
    ).rows;
    return {
      records: rows.slice(0, 100).map(record),
      nextCursor: rows.length > 100 ? rows[99]!.id : null,
    };
  }
  async count(organizationId: string, module: BusinessModuleKey, entity: string) {
    return Number(
      (
        await this.client.query<{ count: number | string }>(
          'SELECT count(*) AS count FROM orkobi_business.records WHERE organization_id=$1 AND module_id=$2 AND entity=$3',
          [organizationId, `orkobi.${module}`, entity],
        )
      ).rows[0]!.count,
    );
  }
  async related(organizationId: string, parentId: string, entity: string) {
    return (
      await this.client.query<Row>(
        `SELECT ${columns} FROM orkobi_business.records WHERE organization_id=$1 AND parent_id=$2 AND entity=$3 ORDER BY id LIMIT 1001 FOR UPDATE`,
        [organizationId, parentId, entity],
      )
    ).rows.map(record);
  }
  async save(input: {
    id: string;
    organizationId: string;
    module: BusinessModuleKey;
    entity: string;
    data: Record<string, unknown>;
    state: string;
    reference?: string | null;
    parentId?: string | null;
    amountMinor?: string;
    userId: string;
    revision?: number;
  }) {
    if (input.revision !== undefined) {
      const result = await this.client.query(
        'UPDATE orkobi_business.records SET data=$3,state=$4,reference_key=$5,parent_id=$6,amount_minor=$7,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2 AND revision=$8',
        [
          input.organizationId,
          input.id,
          input.data,
          input.state,
          input.reference ?? null,
          input.parentId ?? null,
          input.amountMinor ?? '0',
          input.revision,
        ],
      );
      if (result.rowCount !== 1) return undefined;
    } else
      await this.client.query(
        'INSERT INTO orkobi_business.records(id,organization_id,module_id,entity,data,state,reference_key,parent_id,amount_minor,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          input.id,
          input.organizationId,
          `orkobi.${input.module}`,
          input.entity,
          input.data,
          input.state,
          input.reference ?? null,
          input.parentId ?? null,
          input.amountMinor ?? '0',
          input.userId,
        ],
      );
    return this.get(input.organizationId, input.id);
  }
  async number(organizationId: string, series: string) {
    const old = (
      await this.client.query<{ counter: number }>(
        'SELECT counter FROM orkobi_business.counters WHERE organization_id=$1 AND series=$2 FOR UPDATE',
        [organizationId, series],
      )
    ).rows[0];
    const next = (old?.counter ?? 0) + 1;
    if (next > 999999) throw new Error('Compteur épuisé.');
    if (old)
      await this.client.query(
        'UPDATE orkobi_business.counters SET counter=$3 WHERE organization_id=$1 AND series=$2',
        [organizationId, series, next],
      );
    else
      await this.client.query(
        'INSERT INTO orkobi_business.counters(organization_id,series,counter) VALUES($1,$2,$3)',
        [organizationId, series, next],
      );
    return `${series}-${String(next).padStart(6, '0')}`;
  }
  async operation(organizationId: string, userId: string, key: string) {
    return (
      await this.client.query<{ requestHash: string; result: Record<string, unknown> }>(
        'SELECT request_hash AS "requestHash",result FROM orkobi_business.operations WHERE organization_id=$1 AND user_id=$2 AND operation_key=$3',
        [organizationId, userId, key],
      )
    ).rows[0];
  }
  async commitOperation(
    organizationId: string,
    userId: string,
    key: string,
    hash: string,
    result: unknown,
  ) {
    await this.client.query(
      'INSERT INTO orkobi_business.operations(organization_id,user_id,operation_key,request_hash,result) VALUES($1,$2,$3,$4,$5)',
      [organizationId, userId, key, hash, result],
    );
  }
  async attach(
    organizationId: string,
    id: string,
    file: { contentBase64: string; sha256: string; size: number; mediaType: string },
  ) {
    await this.client.query(
      'INSERT INTO orkobi_business.attachments(record_id,organization_id,content_base64,sha256,size,media_type) VALUES($1,$2,$3,$4,$5,$6)',
      [id, organizationId, file.contentBase64, file.sha256, file.size, file.mediaType],
    );
  }
  async attachment(organizationId: string, id: string) {
    return (
      await this.client.query<{
        contentBase64: string;
        sha256: string;
        size: number;
        mediaType: string;
      }>(
        'SELECT content_base64 AS "contentBase64",sha256,size,media_type AS "mediaType" FROM orkobi_business.attachments WHERE organization_id=$1 AND record_id=$2',
        [organizationId, id],
      )
    ).rows[0];
  }
  async attachmentBytes(organizationId: string) {
    return BigInt(
      (
        await this.client.query<{ total: string | number }>(
          'SELECT coalesce(sum(size),0) AS total FROM orkobi_business.attachments WHERE organization_id=$1',
          [organizationId],
        )
      ).rows[0]!.total,
    );
  }
  async report(organizationId: string, module: BusinessModuleKey) {
    return (
      await this.client.query<{
        entity: string;
        state: string;
        count: string | number;
        amountMinor: string;
      }>(
        `SELECT entity,state,count(*) AS count,CAST(coalesce(sum(amount_minor),0) AS ${this.client.dialect === 'mysql' || this.client.dialect === 'mariadb' ? 'CHAR' : 'text'}) AS "amountMinor" FROM orkobi_business.records WHERE organization_id=$1 AND module_id=$2 GROUP BY entity,state ORDER BY entity,state`,
        [organizationId, `orkobi.${module}`],
      )
    ).rows.map((row) => ({
      ...row,
      count: Number(row.count),
      amountMinor: String(row.amountMinor),
    }));
  }
}
