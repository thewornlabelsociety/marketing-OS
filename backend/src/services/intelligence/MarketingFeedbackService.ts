import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import type { CreativeFeedbackRecord, FeedbackType, FeedbackSentiment } from '../../types/marketing';

interface FeedbackRow {
  id: string;
  workspace_id: string;
  artifact_id: string | null;
  campaign_id: string | null;
  feedback_type: string;
  sentiment: string;
  feedback_text: string | null;
  operator_decision: string | null;
  context_json: string | null;
  created_at: string;
}

function toPublic(row: FeedbackRow): CreativeFeedbackRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    artifactId: row.artifact_id,
    campaignId: row.campaign_id,
    feedbackType: row.feedback_type as FeedbackType,
    sentiment: row.sentiment as FeedbackSentiment,
    feedbackText: row.feedback_text,
    operatorDecision: row.operator_decision,
    context: row.context_json ? JSON.parse(row.context_json) : null,
    createdAt: row.created_at,
  };
}

export class MarketingFeedbackService {
  record(params: {
    workspaceId: string;
    feedbackType: FeedbackType;
    sentiment: FeedbackSentiment;
    artifactId?: string | null;
    campaignId?: string | null;
    feedbackText?: string | null;
    operatorDecision?: string | null;
    context?: Record<string, unknown> | null;
  }): CreativeFeedbackRecord {
    const id = `cfb_${randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO creative_feedback
        (id, workspace_id, artifact_id, campaign_id, feedback_type, sentiment,
         feedback_text, operator_decision, context_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.workspaceId,
      params.artifactId ?? null,
      params.campaignId ?? null,
      params.feedbackType,
      params.sentiment,
      params.feedbackText ?? null,
      params.operatorDecision ?? null,
      params.context ? JSON.stringify(params.context) : null,
      now,
    );
    return toPublic(db.prepare('SELECT * FROM creative_feedback WHERE id = ?').get(id) as FeedbackRow);
  }

  list(workspaceId: string, options?: { artifactId?: string; campaignId?: string; limit?: number }): CreativeFeedbackRecord[] {
    const limit = options?.limit ?? 50;
    if (options?.artifactId) {
      return (db.prepare('SELECT * FROM creative_feedback WHERE workspace_id = ? AND artifact_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(workspaceId, options.artifactId, limit) as FeedbackRow[]).map(toPublic);
    }
    if (options?.campaignId) {
      return (db.prepare('SELECT * FROM creative_feedback WHERE workspace_id = ? AND campaign_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(workspaceId, options.campaignId, limit) as FeedbackRow[]).map(toPublic);
    }
    return (db.prepare('SELECT * FROM creative_feedback WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(workspaceId, limit) as FeedbackRow[]).map(toPublic);
  }
}

export const marketingFeedbackService = new MarketingFeedbackService();
