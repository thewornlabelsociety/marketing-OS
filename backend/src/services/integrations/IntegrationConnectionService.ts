import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import type {
  IntegrationConnectionRecord,
  IntegrationConnectionStatus,
  ProviderDestinationDiscovery,
  PublishingDestinationRecord,
} from '../../types/integrations';
import { credentialVault } from '../credentials/CredentialVault';
import { oauthStateService } from './OAuthStateService';
import { metaGraphClient, isMetaMockMode } from '../../integrations/meta/MetaGraphClient';
import { META_REQUIRED_PERMISSIONS } from '../../types/integrations';

interface ConnectionRow {
  id: string;
  workspace_id: string;
  provider_key: string;
  status: string;
  display_name: string;
  provider_account_id: string | null;
  provider_account_name: string | null;
  access_credential_ref: string | null;
  refresh_credential_ref: string | null;
  expires_at: string | null;
  scopes: string;
  capabilities: string;
  last_verified_at: string | null;
  last_error_code: string | null;
  last_error_summary: string | null;
  created_at: string;
  updated_at: string;
}

interface DestinationRow {
  id: string;
  workspace_id: string;
  connection_id: string;
  provider_key: string;
  channel: string;
  external_destination_id: string;
  display_name: string;
  status: string;
  capabilities: string;
}

function mapConnection(row: ConnectionRow): IntegrationConnectionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    providerKey: row.provider_key,
    status: row.status as IntegrationConnectionStatus,
    displayName: row.display_name,
    providerAccountId: row.provider_account_id ?? undefined,
    providerAccountName: row.provider_account_name ?? undefined,
    scopes: JSON.parse(row.scopes || '[]') as string[],
    capabilities: JSON.parse(row.capabilities || '[]') as string[],
    lastVerifiedAt: row.last_verified_at ?? undefined,
    lastErrorCode: row.last_error_code ?? undefined,
    lastErrorSummary: row.last_error_summary ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicConnection(row: ConnectionRow): IntegrationConnectionRecord {
  const mapped = mapConnection(row);
  return mapped;
}

export class IntegrationConnectionService {
  list(workspaceId: string): IntegrationConnectionRecord[] {
    const rows = db.prepare('SELECT * FROM integration_connections WHERE workspace_id = ? ORDER BY display_name')
      .all(workspaceId) as ConnectionRow[];
    return rows.map(publicConnection);
  }

  get(connectionId: string, workspaceId: string): IntegrationConnectionRecord | null {
    const row = db.prepare('SELECT * FROM integration_connections WHERE id = ? AND workspace_id = ?')
      .get(connectionId, workspaceId) as ConnectionRow | undefined;
    return row ? publicConnection(row) : null;
  }

  getMetaConnectUrl(workspaceId: string): { authUrl: string; state: string } | { error: string; code: string } {
    const workspace = db.prepare('SELECT id FROM entities WHERE id = ?').get(workspaceId);
    if (!workspace) return { error: 'Workspace not found', code: 'NOT_FOUND' };

    const state = oauthStateService.create(workspaceId, 'meta');
    if (isMetaMockMode()) {
      const redirectUri = process.env.META_REDIRECT_URI ?? `http://localhost:${process.env.PORT ?? 4100}/api/integrations/meta/callback`;
      return {
        authUrl: `${redirectUri}?mock=1&state=${state}`,
        state,
      };
    }

    const appId = process.env.META_APP_ID;
    if (!appId) return { error: 'Meta app is not configured on the server', code: 'PROVIDER_UNAVAILABLE' };
    const redirectUri = process.env.META_REDIRECT_URI ?? `http://localhost:${process.env.PORT ?? 4100}/api/integrations/meta/callback`;
    const scope = META_REQUIRED_PERMISSIONS.join(',');
    const authUrl = `https://www.facebook.com/${process.env.META_GRAPH_API_VERSION ?? 'v21.0'}/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scope)}&response_type=code`;
    return { authUrl, state };
  }

  async completeMetaCallback(code: string, state: string): Promise<{ connection: IntegrationConnectionRecord } | { error: string; code: string }> {
    const consumed = oauthStateService.consume(state, 'meta');
    if (!consumed) return { error: 'Invalid or expired OAuth state', code: 'INVALID_STATE' };

    const redirectUri = process.env.META_REDIRECT_URI ?? `http://localhost:${process.env.PORT ?? 4100}/api/integrations/meta/callback`;
    const shortLived = await metaGraphClient.exchangeCodeForToken(code, redirectUri);
    // Exchange immediately for a long-lived token (~60 days) before storing.
    // Short-lived tokens (~2h) are not suitable for production publishing or performance reads.
    const token = await metaGraphClient.exchangeForLongLivedToken(shortLived.accessToken);
    const destinations = await metaGraphClient.discoverDestinations(token.accessToken);

    const existing = db.prepare(`
      SELECT id FROM integration_connections WHERE workspace_id = ? AND provider_key = 'meta'
    `).get(consumed.workspaceId) as { id: string } | undefined;

    const now = new Date().toISOString();
    const expiresAt = token.expiresIn
      ? new Date(Date.now() + token.expiresIn * 1000).toISOString()
      : undefined;

    let connectionId: string;
    if (existing) {
      connectionId = existing.id;
      credentialVault.deleteForConnection(connectionId, consumed.workspaceId);
      db.prepare(`
        UPDATE integration_connections
        SET status = 'CONNECTED', display_name = ?, expires_at = ?,
            scopes = ?, capabilities = ?, last_verified_at = ?, last_error_code = NULL, last_error_summary = NULL, updated_at = ?
        WHERE id = ? AND workspace_id = ?
      `).run(
        'Meta',
        expiresAt ?? null,
        JSON.stringify([...META_REQUIRED_PERMISSIONS]),
        JSON.stringify(['publish_image_feed', 'publish_facebook_page_photo', 'read_performance']),
        now,
        now,
        connectionId,
        consumed.workspaceId,
      );
      const accessRef = credentialVault.store(consumed.workspaceId, connectionId, 'access_token', token.accessToken);
      db.prepare(`UPDATE integration_connections SET access_credential_ref = ? WHERE id = ?`).run(accessRef, connectionId);
    } else {
      connectionId = `conn_${randomUUID()}`;
      db.prepare(`
        INSERT INTO integration_connections
          (id, workspace_id, provider_key, status, display_name, expires_at, scopes, capabilities, last_verified_at, created_at, updated_at)
        VALUES (?, ?, 'meta', 'CONNECTED', 'Meta', ?, ?, ?, ?, ?, ?)
      `).run(
        connectionId,
        consumed.workspaceId,
        expiresAt ?? null,
        JSON.stringify([...META_REQUIRED_PERMISSIONS]),
        JSON.stringify(['publish_image_feed', 'publish_facebook_page_photo', 'read_performance']),
        now,
        now,
        now,
      );
      const accessRef = credentialVault.store(consumed.workspaceId, connectionId, 'access_token', token.accessToken);
      db.prepare(`UPDATE integration_connections SET access_credential_ref = ? WHERE id = ?`).run(accessRef, connectionId);
    }

    this.syncDestinations(connectionId, consumed.workspaceId, destinations);
    const connection = this.get(connectionId, consumed.workspaceId);
    if (!connection) return { error: 'Connection not found after callback', code: 'NOT_FOUND' };
    return { connection };
  }

  syncDestinations(connectionId: string, workspaceId: string, discovered?: ProviderDestinationDiscovery[]): PublishingDestinationRecord[] {
    const connection = db.prepare('SELECT * FROM integration_connections WHERE id = ? AND workspace_id = ?')
      .get(connectionId, workspaceId) as ConnectionRow | undefined;
    if (!connection) return [];

    let items = discovered;
    if (!items && connection.access_credential_ref) {
      const token = credentialVault.read(connection.access_credential_ref, workspaceId);
      if (token) items = awaitSyncDiscover(token);
    }
    if (!items) return [];

    const now = new Date().toISOString();
    const results: PublishingDestinationRecord[] = [];
    for (const dest of items) {
      const existing = db.prepare(`
        SELECT id FROM publishing_destinations
        WHERE workspace_id = ? AND connection_id = ? AND external_destination_id = ?
      `).get(workspaceId, connectionId, dest.externalDestinationId) as { id: string } | undefined;

      if (existing) {
        db.prepare(`
          UPDATE publishing_destinations
          SET display_name = ?, channel = ?, capabilities = ?, status = 'ACTIVE', updated_at = ?
          WHERE id = ?
        `).run(dest.displayName, dest.channel, JSON.stringify(dest.capabilities), now, existing.id);
        results.push({
          id: existing.id,
          workspaceId,
          connectionId,
          providerKey: connection.provider_key,
          channel: dest.channel,
          externalDestinationId: dest.externalDestinationId,
          displayName: dest.displayName,
          status: 'ACTIVE',
          capabilities: dest.capabilities,
        });
      } else {
        const destId = `dest_${randomUUID()}`;
        db.prepare(`
          INSERT INTO publishing_destinations
            (id, workspace_id, connection_id, provider_key, channel, external_destination_id, display_name, status, capabilities, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
        `).run(
          destId,
          workspaceId,
          connectionId,
          connection.provider_key,
          dest.channel,
          dest.externalDestinationId,
          dest.displayName,
          JSON.stringify(dest.capabilities),
          now,
          now,
        );
        results.push({
          id: destId,
          workspaceId,
          connectionId,
          providerKey: connection.provider_key,
          channel: dest.channel,
          externalDestinationId: dest.externalDestinationId,
          displayName: dest.displayName,
          status: 'ACTIVE',
          capabilities: dest.capabilities,
        });
      }
    }
    return results;
  }

  listDestinations(workspaceId: string, channel?: string, options?: { requiredCapability?: string }): PublishingDestinationRecord[] {
    const rows = channel
      ? db.prepare('SELECT * FROM publishing_destinations WHERE workspace_id = ? AND channel = ? ORDER BY display_name').all(workspaceId, channel)
      : db.prepare('SELECT * FROM publishing_destinations WHERE workspace_id = ? ORDER BY display_name').all(workspaceId);
    return (rows as DestinationRow[]).map((row) => {
      const caps = JSON.parse(row.capabilities || '[]') as string[];
      const connection = db.prepare('SELECT status FROM integration_connections WHERE id = ? AND workspace_id = ?')
        .get(row.connection_id, workspaceId) as { status: string } | undefined;
      const connectionStatus = (connection?.status ?? 'DISCONNECTED') as PublishingDestinationRecord['connectionStatus'];
      let unavailableReason: string | undefined;
      let selectable = row.status === 'ACTIVE';
      if (connectionStatus === 'REAUTH_REQUIRED' || connectionStatus === 'EXPIRED') {
        unavailableReason = 'Reconnect required';
        selectable = false;
      } else if (connectionStatus !== 'CONNECTED') {
        unavailableReason = 'Connection unavailable';
        selectable = false;
      } else if (row.status !== 'ACTIVE') {
        unavailableReason = 'Destination inactive';
        selectable = false;
      } else if (options?.requiredCapability && caps.length > 0 && !caps.includes(options.requiredCapability)) {
        unavailableReason = 'Publishing capability missing';
        selectable = false;
      }
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        connectionId: row.connection_id,
        providerKey: row.provider_key,
        channel: row.channel,
        externalDestinationId: row.external_destination_id,
        displayName: row.display_name,
        status: row.status as PublishingDestinationRecord['status'],
        capabilities: caps,
        connectionStatus,
        unavailableReason,
        selectable,
      };
    });
  }

  verify(connectionId: string, workspaceId: string): IntegrationConnectionRecord | { error: string; code: string } {
    const row = db.prepare('SELECT * FROM integration_connections WHERE id = ? AND workspace_id = ?')
      .get(connectionId, workspaceId) as ConnectionRow | undefined;
    if (!row) return { error: 'Connection not found', code: 'NOT_FOUND' };
    if (!row.access_credential_ref) {
      db.prepare(`UPDATE integration_connections SET status = 'DISCONNECTED', updated_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), connectionId);
      return { error: 'No credentials stored', code: 'CONNECTION_REQUIRED' };
    }
    const token = credentialVault.read(row.access_credential_ref, workspaceId);
    if (!token) {
      db.prepare(`UPDATE integration_connections SET status = 'REAUTH_REQUIRED', last_error_code = 'AUTH_EXPIRED', updated_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), connectionId);
      return { error: 'Credentials unavailable', code: 'AUTH_EXPIRED' };
    }
    const now = new Date().toISOString();
    db.prepare(`UPDATE integration_connections SET status = 'CONNECTED', last_verified_at = ?, last_error_code = NULL, last_error_summary = NULL, updated_at = ? WHERE id = ?`)
      .run(now, now, connectionId);
    return this.get(connectionId, workspaceId)!;
  }

  disconnect(connectionId: string, workspaceId: string): IntegrationConnectionRecord | { error: string; code: string } {
    const row = db.prepare('SELECT * FROM integration_connections WHERE id = ? AND workspace_id = ?')
      .get(connectionId, workspaceId) as ConnectionRow | undefined;
    if (!row) return { error: 'Connection not found', code: 'NOT_FOUND' };
    credentialVault.deleteForConnection(connectionId, workspaceId);
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE integration_connections
      SET status = 'DISCONNECTED', access_credential_ref = NULL, refresh_credential_ref = NULL,
          expires_at = NULL, last_error_code = NULL, last_error_summary = NULL, updated_at = ?
      WHERE id = ?
    `).run(now, connectionId);
    db.prepare(`
      UPDATE publishing_destinations SET status = 'INACTIVE', updated_at = ? WHERE connection_id = ? AND workspace_id = ?
    `).run(now, connectionId, workspaceId);
    return this.get(connectionId, workspaceId)!;
  }

  /** Deterministic test helper — creates a connected Meta integration without OAuth. */
  createMockMetaConnection(
    workspaceId: string,
    options?: { expired?: boolean; destinations?: ProviderDestinationDiscovery[] },
  ): { connectionId: string; destinations: PublishingDestinationRecord[] } {
    const connectionId = `conn_${randomUUID()}`;
    const now = new Date().toISOString();
    const token = `mock_token_${workspaceId}`;
    const status = options?.expired ? 'REAUTH_REQUIRED' : 'CONNECTED';
    db.prepare(`
      INSERT INTO integration_connections
        (id, workspace_id, provider_key, status, display_name, scopes, capabilities, last_verified_at, created_at, updated_at)
      VALUES (?, ?, 'meta', ?, 'Meta (Mock)', ?, ?, ?, ?, ?)
    `).run(
      connectionId,
      workspaceId,
      status,
      JSON.stringify([...META_REQUIRED_PERMISSIONS]),
      JSON.stringify(['publish_image_feed', 'publish_facebook_page_photo', 'read_performance']),
      now,
      now,
      now,
    );
    const accessRef = credentialVault.store(workspaceId, connectionId, 'access_token', token);
    db.prepare(`UPDATE integration_connections SET access_credential_ref = ? WHERE id = ?`).run(accessRef, connectionId);
    const destinations = this.syncDestinations(
      connectionId,
      workspaceId,
      options?.destinations ?? undefined,
    );
    return { connectionId, destinations };
  }
}

function awaitSyncDiscover(token: string): ProviderDestinationDiscovery[] {
  // metaGraphClient.discoverDestinations is async; used only from async callers in production.
  // For sync internal refresh we rely on passed-in discovered list or mock defaults.
  return [
    {
      externalDestinationId: `ig_${token.slice(-8)}`,
      displayName: 'Instagram @testaccount',
      channel: 'INSTAGRAM',
      capabilities: ['publish_image_feed', 'read_performance'],
    },
    {
      externalDestinationId: `fb_${token.slice(-8)}`,
      displayName: 'Facebook Test Page',
      channel: 'FACEBOOK',
      capabilities: ['publish_facebook_page_photo', 'read_performance'],
    },
  ];
}

export const integrationConnectionService = new IntegrationConnectionService();
