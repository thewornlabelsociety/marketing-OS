export const env = {
  port: Number(process.env.PORT) || 4100,
  nodeEnv: process.env.NODE_ENV || 'development',
  /** Legacy stub — database.ts uses SQLITE_PATH, not DB_PATH. Cleanup deferred post-PG-1. */
  dbPath: process.env.DB_PATH || './app_data.db',
  /** Optional Supabase/Postgres connection string (PG-1+). Not used by server startup in PG-1. */
  databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
};
