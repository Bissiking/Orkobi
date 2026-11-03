import { URL } from 'node:url';
import { createRequire } from 'node:module';
import { compileMySql } from '../../lib/database/dist/index.js';
const require = createRequire(new URL('../../lib/database/package.json', import.meta.url));
const pg = require('pg');
const mysql = require('mysql2/promise');
/** Connexion technique réservée aux tests : les applications utilisent le vrai adaptateur. */
export class Pool {
  constructor(config) {
    this.mysql = config.engine && config.engine !== 'postgresql';
    const connection = { ...config };
    delete connection.engine;
    this.pool = this.mysql
      ? mysql.createPool({
          ...connection,
          timezone: 'Z',
          dateStrings: true,
          decimalNumbers: true,
          multipleStatements: false,
        })
      : new pg.Pool(config);
  }
  async query(text, parameters = []) {
    if (!this.mysql) return this.pool.query(text, parameters);
    const compiled = compileMySql(text, parameters);
    try {
      const [rows] = await this.pool.query(compiled.sql, compiled.values);
      return Array.isArray(rows)
        ? { rows: rows.map((row) => ({ ...row })), rowCount: rows.length }
        : { rows: [], rowCount: rows.affectedRows };
    } catch (error) {
      error.code =
        {
          ER_NO_REFERENCED_ROW_2: '23503',
          ER_TABLEACCESS_DENIED_ERROR: '42501',
          ER_DBACCESS_DENIED_ERROR: '42501',
        }[error.code] ?? error.code;
      throw error;
    }
  }
  end() {
    return this.pool.end();
  }
}
