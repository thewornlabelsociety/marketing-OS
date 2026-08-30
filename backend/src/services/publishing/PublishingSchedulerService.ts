import { publishingService } from './PublishingService';
import { schedulingService } from './SchedulingService';
import { db } from '../../db/database';

const DEFAULT_POLL_MS = Number(process.env.PUBLISHING_POLL_MS ?? 30000);

export class PublishingSchedulerService {
  private timer: NodeJS.Timeout | null = null;

  start(pollMs = DEFAULT_POLL_MS): void {
    if (this.timer) return;
    void this.executeDueScheduledItems(new Date());
    this.timer = setInterval(() => {
      void this.executeDueScheduledItems(new Date());
    }, pollMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async executeDueScheduledItems(now: Date): Promise<{ processed: number; published: number; failed: number; skipped: number }> {
    const dueRows = db.prepare(`
      SELECT id, campaign_id FROM scheduled_content_items
      WHERE status IN ('SCHEDULED', 'READY')
        AND publication_mode = 'DIRECT'
        AND cancelled_at IS NULL
        AND datetime(scheduled_for) <= datetime(?)
      ORDER BY scheduled_for ASC
    `).all(now.toISOString()) as { id: string; campaign_id: string }[];

    let processed = 0;
    let published = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of dueRows) {
      processed += 1;
      const schedule = schedulingService.getById(row.id, row.campaign_id);
      if (!schedule || schedule.status === 'BLOCKED' || schedule.status === 'CANCELLED' || schedule.status === 'PUBLISHED') {
        skipped += 1;
        continue;
      }

      const result = await publishingService.publishSchedule(row.id, row.campaign_id);
      if ('error' in result) {
        if (result.code === 'ALREADY_PUBLISHED') skipped += 1;
        else failed += 1;
      } else if (result.item.status === 'PUBLISHED') {
        published += 1;
      } else if (result.item.status === 'FAILED') {
        failed += 1;
      }
    }

    return { processed, published, failed, skipped };
  }
}

export const publishingSchedulerService = new PublishingSchedulerService();
