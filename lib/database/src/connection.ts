/** Interfaces internes au dépôt ; aucune connexion n'est exposée au SDK. */
export type SqlEngine = 'postgresql' | 'mariadb' | 'mysql';
export interface SqlResult<Row extends object> {
  rows: Row[];
  rowCount: number | null;
}
export interface SqlClient {
  readonly dialect?: SqlEngine;
  query<Row extends object = Record<string, unknown>>(
    text: string,
    parameters?: unknown[],
  ): Promise<SqlResult<Row>>;
  release(destroy?: boolean): void;
  on(event: 'error', listener: (error: Error) => void): unknown;
  off(event: 'error', listener: (error: Error) => void): unknown;
}
export interface SqlPool {
  connect(): Promise<SqlClient>;
  end(): Promise<void>;
}
