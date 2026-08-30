import { randomBytes } from 'crypto';
import { db } from '../../db/database';

const STATE_TTL_MS = 15 * 60 * 1000;

export class OAuthStateService {
  create(workspaceId: string, providerKey: string): string {
    this.purgeExpired();
    const state = randomBytes(24).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + STATE_TTL_MS).toISOString();
    db.prepare(`
      INSERT INTO oauth_states (state, workspace_id, provider_key, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(state, workspaceId, providerKey, now.toISOString(), expiresAt);
    return state;
  }

  consume(state: string, providerKey: string): { workspaceId: string } | null {
    this.purgeExpired();
    const row = db.prepare(`
      SELECT workspace_id, provider_key, expires_at FROM oauth_states WHERE state = ?
    `).get(state) as { workspace_id: string; provider_key: string; expires_at: string } | undefined;
    if (!row || row.provider_key !== providerKey) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
      return null;
    }
    db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
    return { workspaceId: row.workspace_id };
  }

  purgeExpired(): void {
    db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(new Date().toISOString());
  }
}

export const oauthStateService = new OAuthStateService();
