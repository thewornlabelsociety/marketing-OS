import type { PoolClient } from 'pg';
import {
  assertCoreDbDriverAllowed,
  resolveCoreDbDriver,
  type CoreDbDriver,
} from '../../config/coreDbConfig';
import type { CoreDomainRepositories } from './coreDomainTypes';
import { SqliteTenantRepository } from '../repositories/sqlite/SqliteTenantRepository';
import { SqliteWorkspaceRepository } from '../repositories/sqlite/SqliteWorkspaceRepository';
import { SqliteObjectiveRepository } from '../repositories/sqlite/SqliteObjectiveRepository';
import { SqliteCampaignRepository } from '../repositories/sqlite/SqliteCampaignRepository';
import { createSqlitePlanningRepositories } from '../repositories/sqlite/SqlitePlanningRepositories';
import {
  PostgresTenantRepository,
  PostgresWorkspaceRepository,
  PostgresObjectiveRepository,
  PostgresCampaignRepository,
} from '../repositories/postgres/PostgresCoreRepositories';
import { createPostgresPlanningRepositories } from '../repositories/postgres/PostgresPlanningRepositories';

let cached: CoreDomainRepositories | null = null;
let cachedDriver: CoreDbDriver | null = null;

export interface CreateCoreRepositoriesOptions {
  env?: NodeJS.ProcessEnv;
  postgresClient?: PoolClient;
}

function normalizeCreateArgs(
  envOrOptions?: NodeJS.ProcessEnv | CreateCoreRepositoriesOptions,
): CreateCoreRepositoriesOptions {
  if (envOrOptions && typeof envOrOptions === 'object' && 'postgresClient' in envOrOptions) {
    const opts = envOrOptions as CreateCoreRepositoriesOptions;
    return { env: opts.env ?? process.env, postgresClient: opts.postgresClient };
  }
  return { env: (envOrOptions as NodeJS.ProcessEnv | undefined) ?? process.env };
}

function buildRepositories(driver: CoreDbDriver, postgresClient?: PoolClient): CoreDomainRepositories {
  if (driver === 'postgres') {
    return {
      driver: 'postgres',
      tenant: new PostgresTenantRepository(),
      workspace: new PostgresWorkspaceRepository(),
      objective: new PostgresObjectiveRepository(),
      campaign: new PostgresCampaignRepository(postgresClient),
      planning: createPostgresPlanningRepositories(postgresClient),
    };
  }
  return {
    driver: 'sqlite',
    tenant: new SqliteTenantRepository(),
    workspace: new SqliteWorkspaceRepository(),
    objective: new SqliteObjectiveRepository(),
    campaign: new SqliteCampaignRepository(),
    planning: createSqlitePlanningRepositories(),
  };
}

/** Lazy singleton for core domain repositories. Default driver: sqlite. */
export function getCoreRepositories(env: NodeJS.ProcessEnv = process.env): CoreDomainRepositories {
  const driver = resolveCoreDbDriver(env);
  assertCoreDbDriverAllowed(driver, env);

  if (cached && cachedDriver === driver) return cached;

  cached = buildRepositories(driver);
  cachedDriver = driver;
  return cached;
}

/** @internal — verification harness resets factory when env changes between sections. */
export function resetCoreRepositoriesForTests(): void {
  cached = null;
  cachedDriver = null;
}

/** Create a fresh repository bundle without touching the route singleton. */
export function createCoreRepositories(
  envOrOptions: NodeJS.ProcessEnv | CreateCoreRepositoriesOptions = process.env,
): CoreDomainRepositories {
  const { env = process.env, postgresClient } = normalizeCreateArgs(envOrOptions);
  const driver = resolveCoreDbDriver(env);
  assertCoreDbDriverAllowed(driver, env);
  return buildRepositories(driver, postgresClient);
}

/** Transaction-scoped repositories sharing one Postgres client. */
export function createCoreRepositoriesWithClient(
  client: PoolClient,
  env: NodeJS.ProcessEnv = process.env,
): CoreDomainRepositories {
  return createCoreRepositories({
    env: { ...env, CORE_DB_DRIVER: 'postgres', PG2_VERIFICATION_ALLOWED: '1' },
    postgresClient: client,
  });
}
