import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import type { WorkspaceChannelStrategy } from '../../types/marketing';

interface StrategyRow {
  id: string;
  workspace_id: string;
  channels_json: string;
  created_at: string;
  updated_at: string;
}

export class ChannelStrategyService {
  get(workspaceId: string): WorkspaceChannelStrategy {
    const row = db.prepare('SELECT * FROM workspace_channel_strategy WHERE workspace_id = ?')
      .get(workspaceId) as StrategyRow | undefined;
    if (!row) return {};
    try { return JSON.parse(row.channels_json); }
    catch { return {}; }
  }

  set(workspaceId: string, strategy: WorkspaceChannelStrategy): WorkspaceChannelStrategy {
    const existing = db.prepare('SELECT id FROM workspace_channel_strategy WHERE workspace_id = ?').get(workspaceId);
    const now = new Date().toISOString();
    const json = JSON.stringify(strategy);
    if (existing) {
      db.prepare('UPDATE workspace_channel_strategy SET channels_json = ?, updated_at = ? WHERE workspace_id = ?')
        .run(json, now, workspaceId);
    } else {
      db.prepare('INSERT INTO workspace_channel_strategy (id, workspace_id, channels_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(`chs_${randomUUID()}`, workspaceId, json, now, now);
    }
    return this.get(workspaceId);
  }

  patch(workspaceId: string, updates: WorkspaceChannelStrategy): WorkspaceChannelStrategy {
    const current = this.get(workspaceId);
    const merged = { ...current, ...updates };
    return this.set(workspaceId, merged);
  }
}

export const channelStrategyService = new ChannelStrategyService();
