export const env = {
  port: Number(process.env.PORT) || 4100,
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || './app_data.db',
};
