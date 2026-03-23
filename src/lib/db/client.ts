import { neon } from '@neondatabase/serverless';
import { getEnv } from '../env';

export type SqlRow = Record<string, unknown>;
type NeonSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<SqlRow[]>;

let sql: NeonSql | null = null;

export function getDb(): NeonSql {
  if (!sql) {
    const url = getEnv('DATABASE_URL');
    if (!url || url === 'placeholder') throw new Error('DATABASE_URL is not set');
    sql = neon(url) as unknown as NeonSql;
  }
  return sql;
}
