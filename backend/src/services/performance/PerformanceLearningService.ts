import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import type { PerformanceClassification } from '../../types/performance';
import { learningService } from './LearningService';

export class PerformanceLearningService {
  extractFromCampaign(
    campaignId: string,
    workspaceId: string,
    classification: PerformanceClassification
  ): void {
    if (classification !== 'HIGH_PERFORMING' && classification !== 'EXCEPTIONAL' && classification !== 'ABOVE_AVERAGE') {
      return;
    }

    const campaign = db.prepare(`
      SELECT c.*, o.objective_type, o.primary_kpi
      FROM campaigns c
      JOIN objectives o ON o.id = c.objective_id
      WHERE c.id = ?
    `).get(campaignId) as {
      id: string;
      workspace_id: string;
      objective_type: string;
      primary_kpi: string;
    } | undefined;

    if (!campaign || campaign.workspace_id !== workspaceId) return;

    const contentRows = db.prepare(`
      SELECT content_key, source_creative_artifact_id, channel,
             SUM(json_extract(metrics, '$.purchases')) as purchases
      FROM performance_observations
      WHERE campaign_id = ?
      GROUP BY content_key, source_creative_artifact_id, channel
      HAVING purchases IS NOT NULL AND purchases > 0
      ORDER BY purchases DESC
    `).all(campaignId) as Array<{ content_key: string; channel: string; purchases: number }>;

    if (contentRows.length === 0) return;

    const top = contentRows[0];
    const channels = [...new Set(contentRows.map((r) => r.channel))];

    const comparableCampaigns = db.prepare(`
      SELECT DISTINCT pe.campaign_id
      FROM performance_evaluations pe
      JOIN campaigns c ON c.id = pe.campaign_id
      WHERE c.workspace_id = ?
        AND pe.objective_type = ?
        AND pe.classification IN ('HIGH_PERFORMING', 'EXCEPTIONAL', 'ABOVE_AVERAGE')
    `).all(workspaceId, campaign.objective_type) as Array<{ campaign_id: string }>;

    if (comparableCampaigns.length < 3) return;

    learningService.upsertCandidate({
      workspaceId,
      type: 'MARKET_PERFORMANCE',
      category: `${campaign.objective_type}_CONTENT`,
      statement: `${top.content_key} content on ${top.channel} drives strong ${campaign.primary_kpi} for ${campaign.objective_type} campaigns`,
      confidence: comparableCampaigns.length >= 4 ? 'MEDIUM' : 'LOW',
      relevanceTags: [campaign.objective_type, top.channel, 'ALL'],
      evidence: comparableCampaigns.map((c) => ({
        sourceType: 'campaign',
        sourceId: c.campaign_id,
      })),
    });
  }

  recordUserPreferenceEvidence(input: {
    workspaceId: string;
    category: string;
    statement: string;
    sourceType: string;
    sourceId: string;
    relevanceTags: string[];
  }): void {
    const now = new Date().toISOString();
    let learningId: string | undefined;

    const existing = db.prepare(`
      SELECT id FROM workspace_learnings
      WHERE workspace_id = ? AND type = 'USER_PREFERENCE' AND category = ? AND status != 'DISMISSED'
    `).get(input.workspaceId, input.category) as { id: string } | undefined;

    if (existing) {
      learningId = existing.id;
    } else {
      learningId = randomUUID();
      db.prepare(`
        INSERT INTO workspace_learnings
          (id, workspace_id, type, category, statement, confidence, evidence_count, status, relevance_tags, created_at, updated_at)
        VALUES (?, ?, 'USER_PREFERENCE', ?, ?, 'LOW', 0, 'CANDIDATE', ?, ?, ?)
      `).run(learningId, input.workspaceId, input.category, input.statement, JSON.stringify(input.relevanceTags), now, now);
    }

    const dup = db.prepare(
      'SELECT id FROM learning_evidence WHERE learning_id = ? AND source_type = ? AND source_id = ?'
    ).get(learningId, input.sourceType, input.sourceId);
    if (!dup) {
      db.prepare(`
        INSERT INTO learning_evidence (id, learning_id, source_type, source_id, observed_at, weight)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(randomUUID(), learningId, input.sourceType, input.sourceId, now);
    }

    const count = db.prepare('SELECT COUNT(*) as c FROM learning_evidence WHERE learning_id = ?').get(learningId) as { c: number };
    db.prepare('UPDATE workspace_learnings SET evidence_count = ?, updated_at = ? WHERE id = ?')
      .run(count.c, now, learningId);

    if (count.c >= 3) {
      db.prepare('UPDATE workspace_learnings SET confidence = ? WHERE id = ?')
        .run(count.c >= 4 ? 'MEDIUM' : 'LOW', learningId);
    }
  }
}

export const performanceLearningService = new PerformanceLearningService();
