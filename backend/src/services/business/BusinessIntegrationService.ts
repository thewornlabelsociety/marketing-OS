import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import { businessCredentialVault } from './BusinessCredentialVault';
import { businessConnectorRegistry } from '../../integrations/business/BusinessConnectorRegistry';
import { WornLabelConnector } from '../../integrations/business/WornLabelConnector';
import type { NormalizedSourceRecord } from '../../types/businessIntegration';

businessConnectorRegistry.register(new WornLabelConnector());

interface IntegrationRow {
  id: string; workspace_id: string; integration_type: string; display_name: string; status: string;
  capabilities: string; config: string; credential_ref: string | null; sync_checkpoint: string | null;
  last_attempted_sync_at: string | null; last_successful_sync_at: string | null; last_error_summary: string | null;
  created_at: string; updated_at: string;
}

function publicIntegration(row: IntegrationRow) {
  return {
    id: row.id, workspaceId: row.workspace_id, integrationType: row.integration_type,
    displayName: row.display_name, status: row.status, capabilities: JSON.parse(row.capabilities),
    lastAttemptedSyncAt: row.last_attempted_sync_at,
    lastSuccessfulSyncAt: row.last_successful_sync_at, syncCheckpoint: row.sync_checkpoint,
    lastErrorSummary: row.last_error_summary,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export class BusinessIntegrationService {
  list(workspaceId: string) {
    return (db.prepare('SELECT * FROM business_integrations WHERE workspace_id = ? ORDER BY created_at').all(workspaceId) as IntegrationRow[]).map(publicIntegration);
  }

  // When a source target (baseUrl) changes, retire source records from the previous target.
  // Records with downstream creative references are preserved as historical provenance.
  // Records with no references are removed transactionally — they are orphaned by the switch.
  private retireObsoleteSourceRecords(integrationId: string, workspaceId: string): void {
    const all = db.prepare('SELECT id FROM source_records WHERE integration_id = ? AND workspace_id = ?')
      .all(integrationId, workspaceId) as { id: string }[];
    if (all.length === 0) return;
    const orphaned: string[] = [];
    let retained = 0;
    for (const record of all) {
      const refs = db.prepare('SELECT COUNT(*) as c FROM creative_source_links WHERE source_record_id = ?')
        .get(record.id) as { c: number };
      if (refs.c === 0) orphaned.push(record.id);
      else retained++;
    }
    if (orphaned.length > 0) {
      const del = db.prepare('DELETE FROM source_records WHERE id = ?');
      db.transaction(() => orphaned.forEach(rid => del.run(rid)))();
    }
    if (retained > 0) {
      console.warn(`[business-integration] ${retained} source record(s) from the previous source target have downstream creative references and have been preserved as historical provenance.`);
    }
  }

  connectWornLabelFromEnvironment(workspaceId: string) {
    const baseUrl = process.env.WORN_LABEL_API_BASE_URL?.trim();
    const serviceToken = process.env.WORN_LABEL_SERVICE_TOKEN?.trim();
    if (!baseUrl || !serviceToken) throw new Error('Worn Label server connection is not configured');
    if (!db.prepare('SELECT id FROM entities WHERE id = ?').get(workspaceId)) throw new Error('Workspace not found');
    const existing = db.prepare("SELECT * FROM business_integrations WHERE workspace_id = ? AND integration_type = 'WORN_LABEL'").get(workspaceId) as IntegrationRow | undefined;
    const connector = businessConnectorRegistry.get('WORN_LABEL')!;
    const now = new Date().toISOString();
    const id = existing?.id ?? `bizint_${randomUUID()}`;
    if (existing) {
      const prevConfig = JSON.parse(existing.config ?? '{}') as Record<string, unknown>;
      const baseUrlChanged = prevConfig.baseUrl !== baseUrl;
      db.prepare(`UPDATE business_integrations SET display_name = 'Worn Label', status = 'CONNECTED', capabilities = ?, config = ?, last_error_summary = NULL${baseUrlChanged ? ', sync_checkpoint = NULL' : ''}, updated_at = ? WHERE id = ? AND workspace_id = ?`)
        .run(JSON.stringify(connector.capabilities), JSON.stringify({ baseUrl }), now, id, workspaceId);
      if (baseUrlChanged) this.retireObsoleteSourceRecords(id, workspaceId);
    } else {
      db.prepare("INSERT INTO business_integrations (id, workspace_id, integration_type, display_name, status, capabilities, config, created_at, updated_at) VALUES (?, ?, 'WORN_LABEL', 'Worn Label', 'CONNECTED', ?, ?, ?, ?)")
        .run(id, workspaceId, JSON.stringify(connector.capabilities), JSON.stringify({ baseUrl }), now, now);
    }
    const credentialRef = businessCredentialVault.storeOrUpdate(workspaceId, id, serviceToken);
    db.prepare('UPDATE business_integrations SET credential_ref = ? WHERE id = ? AND workspace_id = ?').run(credentialRef, id, workspaceId);
    return publicIntegration(db.prepare('SELECT * FROM business_integrations WHERE id = ?').get(id) as IntegrationRow);
  }

  async sync(id: string, workspaceId: string) {
    const row = db.prepare('SELECT * FROM business_integrations WHERE id = ? AND workspace_id = ?').get(id, workspaceId) as IntegrationRow | undefined;
    if (!row) throw new Error('Integration not found');
    const connector = businessConnectorRegistry.get(row.integration_type);
    if (!connector) throw new Error('Connector is not available');
    const attemptedAt = new Date().toISOString();
    db.prepare("UPDATE business_integrations SET status = 'SYNCING', last_attempted_sync_at = ?, updated_at = ? WHERE id = ?").run(attemptedAt, attemptedAt, id);
    try {
      const result = await connector.sync(JSON.parse(row.config), row.credential_ref ? businessCredentialVault.read(row.credential_ref, workspaceId) : null, row.sync_checkpoint);
      const valid: NormalizedSourceRecord[] = [];
      const failures: { externalId?: string; error: string }[] = [];
      for (const record of result.records) {
        if (!record.externalId || !record.title || !record.sourceType || !Array.isArray(record.imageUrls)) failures.push({ externalId: record.externalId, error: 'Required marketing fields are missing' });
        else valid.push(record);
      }
      const syncedAt = new Date().toISOString();
      const upsert = db.prepare(`INSERT INTO source_records
        (id, workspace_id, integration_id, source_type, external_id, title, subtitle, description, image_urls, price_amount, price_currency, availability, occurred_at, source_updated_at, payload, last_synced_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(integration_id, external_id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, description=excluded.description,
          image_urls=excluded.image_urls, price_amount=excluded.price_amount, price_currency=excluded.price_currency, availability=excluded.availability,
          occurred_at=excluded.occurred_at, source_updated_at=excluded.source_updated_at, payload=excluded.payload, last_synced_at=excluded.last_synced_at, updated_at=excluded.updated_at`);
      db.transaction(() => valid.forEach(record => upsert.run(
        `source_${id}_${record.externalId}`, workspaceId, id, record.sourceType, record.externalId, record.title,
        record.subtitle ?? null, record.description ?? null, JSON.stringify(record.imageUrls), record.priceAmount ?? null,
        record.priceCurrency ?? null, record.availability, record.occurredAt ?? null, record.sourceUpdatedAt ?? null,
        JSON.stringify(record.payload), syncedAt, syncedAt, syncedAt,
      )))();
      db.prepare("UPDATE business_integrations SET status = 'CONNECTED', sync_checkpoint = ?, last_successful_sync_at = ?, last_error_summary = ?, updated_at = ? WHERE id = ?")
        .run(result.checkpoint ?? row.sync_checkpoint, syncedAt, failures.length ? `${failures.length} product(s) could not be imported` : null, syncedAt, id);
      return { imported: valid.length, failed: failures.length, failures, lastSuccessfulSyncAt: syncedAt };
    } catch (error) {
      const summary = (error as Error).message;
      db.prepare("UPDATE business_integrations SET status = 'NEEDS_ATTENTION', last_error_summary = ?, updated_at = ? WHERE id = ?")
        .run(summary, new Date().toISOString(), id);
      throw error;
    }
  }
}

export const businessIntegrationService = new BusinessIntegrationService();
