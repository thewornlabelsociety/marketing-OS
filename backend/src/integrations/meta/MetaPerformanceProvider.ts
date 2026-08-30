import { db } from '../../db/database';
import type { MarketingChannel } from '../../types/channels';
import type { MeasurementWindow } from '../../types/performance';
import type {
  FetchPerformanceRequest,
  PerformanceProvider,
  ProviderPerformanceResult,
} from '../contracts/PerformanceProvider';
import { metaGraphClient } from './MetaGraphClient';

interface ScheduleRow {
  id: string;
  content_key: string;
  source_creative_artifact_id: string;
  source_creative_version: number;
  channel: string;
  destination_id: string | null;
  external_publish_id: string | null;
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

    const items: ProviderPerformanceResult['items'] = [];
    for (const schedule of filtered) {
      if (!schedule.external_publish_id) continue;
      const insights = await metaGraphClient.fetchInsights({
        externalPublishId: schedule.external_publish_id,
        channel: schedule.channel as 'INSTAGRAM' | 'FACEBOOK',
        measurementWindow: '7_DAYS',
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
