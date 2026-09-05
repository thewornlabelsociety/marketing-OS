import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getPostgresPool } from '../postgres/postgresPool';

/** Routes Postgres queries through an optional transaction client. */
export class PostgresQueryable {
  constructor(private readonly client?: PoolClient) {}

  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>> {
    if (this.client) {
      return this.client.query<R>(text, params);
    }
    return getPostgresPool().query<R>(text, params);
  }
}
