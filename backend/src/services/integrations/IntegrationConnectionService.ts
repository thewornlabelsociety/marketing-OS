import { db } from '../../db/database';
import type { IntegrationConnection, PublishingDestination } from '../../types/scheduledContent';

interface ConnectionRow {
  id: string;
  workspace_id: string;
  provider_key: string;
  status: string;
  display_name: string;
  capabilities: string;
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
}

export class IntegrationConnectionService {
  list(workspaceId: string): IntegrationConnection[] {
    const rows = db.prepare('SELECT * FROM integration_connections WHERE workspace_id = ? ORDER BY display_name').all(workspaceId) as ConnectionRow[];
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      providerKey: row.provider_key,
      status: row.status as IntegrationConnection['status'],
      displayName: row.display_name,
      capabilities: JSON.parse(row.capabilities) as string[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  listDestinations(workspaceId: string, channel?: string): PublishingDestination[] {
    const rows = channel
      ? db.prepare('SELECT * FROM publishing_destinations WHERE workspace_id = ? AND channel = ? ORDER BY display_name').all(workspaceId, channel)
      : db.prepare('SELECT * FROM publishing_destinations WHERE workspace_id = ? ORDER BY display_name').all(workspaceId);
    return (rows as DestinationRow[]).map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      connectionId: row.connection_id,
      providerKey: row.provider_key,
      channel: row.channel as PublishingDestination['channel'],
      externalDestinationId: row.external_destination_id,
      displayName: row.display_name,
      status: row.status as PublishingDestination['status'],
    }));
  }
}

export const integrationConnectionService = new IntegrationConnectionService();
