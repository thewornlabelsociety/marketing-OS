import { db } from '../../db/database';
import type { MarketingChannel } from '../../types/channels';
import type { MeasurementWindow } from '../../types/performance';
import type {
  FetchPerformanceRequest,
  PerformanceProvider,
  ProviderPerformanceResult,
} from '../contracts/PerformanceProvider';
import { credentialVault } from '../../services/credentials/CredentialVault';
import { metaGraphClient, isMetaMockMode } from './MetaGraphClient';

interface ScheduleRow {
  id: string;
  content_key: string;
  source_creative_artifact_id: string;
  source_creative_version: number;
  channel: string;
  destination_id: string | null;
  external_publish_id: string | null;
}

interface DestinationRow {
  id: string;
  workspace_id: string;
  connection_id: string;
  channel: string;
}

interface ConnectionRow {
  id: string;
  workspace_id: string;
  status: string;
  access_credential_ref: string | null;
  expires_at: string | null;
}

export class MetaPerformanceProvider implements PerformanceProvider {
  readonly providerKey = 'meta';

  supports(channel: MarketingChannel): boolean {
    return channel === 'INSTAGRAM' || channel === 'FACEBOOK';
  }

  async fetchPerformance(request: FetchPerformanceRequest): Promise<ProviderPerformanceResult> {
    const schedules = db.prepare(`
      SELECT id, content_key, source_creative_artifact_id, source_creative_version, channel, destination_id, external_publish_id
      FROM scheduled_content_items
      WHERE campaign_id = ? AND workspace_id = ? AND status = 'PUBLISHED' AND external_publish_id IS NOT NULL
    `).all(request.campaignId, request.workspaceId) as ScheduleRow[];

    const filtered = request.scheduleIds?.length
      ? schedules.filter((s) => request.scheduleIds!.includes(s.id))
      : schedules;

    // Cache resolved tokens per destination_id to avoid repeated vault reads.
    const tokenCache = new Map<string, string>();

    const items: ProviderPerformanceResult['items'] = [];
    for (const schedule of filtered) {
      if (!schedule.external_publish_id) continue;

      let accessToken = '';

      if (!isMetaMockMode()) {
        if (!schedule.destination_id) {
          throw Object.assign(
            new Error('Published schedule has no destination — cannot resolve credential'),
            { code: 'CONNECTION_REQUIRED' },
          );
        }

        if (tokenCache.has(schedule.destination_id)) {
          accessToken = tokenCache.get(schedule.destination_id)!;
        } else {
          const destination = db.prepare(
            'SELECT id, workspace_id, connection_id, channel FROM publishing_destinations WHERE id = ?'
          ).get(schedule.destination_id) as DestinationRow | undefined;
          if (!destination) {
            throw Object.assign(
              new Error('Publishing destination not found'),
              { code: 'CONNECTION_REQUIRED' },
            );
          }

          const connection = db.prepare(
            'SELECT id, workspace_id, status, access_credential_ref, expires_at FROM integration_connections WHERE id = ?'
          ).get(destination.connection_id) as ConnectionRow | undefined;
          if (!connection || connection.workspace_id !== request.workspaceId) {
            throw Object.assign(
              new Error('Meta connection not found for this workspace'),
              { code: 'CONNECTION_REQUIRED' },
            );
          }
          if (connection.status === 'REAUTH_REQUIRED' || connection.status === 'EXPIRED') {
            throw Object.assign(
              new Error('Meta connection needs reauthorization'),
              { code: 'AUTH_EXPIRED' },
            );
          }
          if (connection.expires_at && new Date(connection.expires_at).getTime() < Date.now()) {
            throw Object.assign(
              new Error('Meta token expired'),
              { code: 'AUTH_EXPIRED' },
            );
          }
          if (!connection.access_credential_ref) {
            throw Object.assign(
              new Error('No credential stored for this Meta connection'),
              { code: 'CREDENTIAL_UNAVAILABLE' },
            );
          }
          const resolved = credentialVault.read(connection.access_credential_ref, request.workspaceId);
          if (!resolved) {
            throw Object.assign(
              new Error('Credential could not be resolved for this workspace'),
              { code: 'CREDENTIAL_UNAVAILABLE' },
            );
          }
          accessToken = resolved;
          tokenCache.set(schedule.destination_id, accessToken);
        }
      }

      const insights = await metaGraphClient.fetchInsights({
        externalPublishId: schedule.external_publish_id,
        channel: schedule.channel as 'INSTAGRAM' | 'FACEBOOK',
        measurementWindow: '7_DAYS',
        accessToken,
      });
      items.push({
        scheduleId: schedule.id,
        contentKey: schedule.content_key,
        sourceCreativeArtifactId: schedule.source_creative_artifact_id,
        sourceCreativeVersion: schedule.source_creative_version,
        channel: schedule.channel as MarketingChannel,
        destinationId: schedule.destination_id ?? undefined,
        externalPublishId: schedule.external_publish_id,
        measurementWindow: '7_DAYS' as MeasurementWindow,
        observedAt: insights.observedAt,
        metrics: {
          impressions: insights.impressions ?? null,
          reach: insights.reach ?? null,
          clicks: insights.clicks ?? null,
          views: insights.views ?? null,
          likes: insights.engagement ?? null,
        },
        rawMetadata: { provider: 'meta', externalPublishId: schedule.external_publish_id },
      });
    }

    return { providerKey: this.providerKey, items };
  }
}

export const metaPerformanceProvider = new MetaPerformanceProvider();
