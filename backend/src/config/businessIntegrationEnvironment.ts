export interface WornLabelIntegrationEnvironment {
  enabled: boolean;
  workspaceId?: string;
  apiBaseUrl?: string;
  syncIntervalMinutes: number;
  diagnostic: string;
}

export function resolveWornLabelIntegrationEnvironment(env: NodeJS.ProcessEnv = process.env): WornLabelIntegrationEnvironment {
  const workspaceId = env.WORN_LABEL_WORKSPACE_ID?.trim();
  const apiBaseUrl = env.WORN_LABEL_API_BASE_URL?.trim();
  const hasToken = Boolean(env.WORN_LABEL_SERVICE_TOKEN?.trim());
  const interval = Number(env.WORN_LABEL_SYNC_INTERVAL_MINUTES ?? 15);
  const missing = [!workspaceId&&'WORN_LABEL_WORKSPACE_ID',!apiBaseUrl&&'WORN_LABEL_API_BASE_URL',!hasToken&&'WORN_LABEL_SERVICE_TOKEN'].filter(Boolean);
  if (missing.length) return { enabled:false, syncIntervalMinutes:15, diagnostic:`Worn Label integration disabled; missing ${missing.join(', ')}` };
  if (!Number.isFinite(interval)||interval<1) return { enabled:false, syncIntervalMinutes:15, diagnostic:'Worn Label integration disabled; WORN_LABEL_SYNC_INTERVAL_MINUTES must be at least 1' };
  try { new URL(apiBaseUrl!); } catch { return { enabled:false, syncIntervalMinutes:interval, diagnostic:'Worn Label integration disabled; WORN_LABEL_API_BASE_URL is not a valid URL' }; }
  return { enabled:true, workspaceId, apiBaseUrl, syncIntervalMinutes:interval, diagnostic:'Worn Label read-only integration configured' };
}
