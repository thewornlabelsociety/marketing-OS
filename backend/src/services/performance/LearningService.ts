import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import type { LearningConfidence, LearningStatus, LearningType, WorkspaceLearning } from '../../types/performance';

interface LearningRow {
  id: string;
  workspace_id: string;
  type: string;
  category: string;
  statement: string;
  confidence: string;
  evidence_count: number;
  status: string;
  relevance_tags: string;
  created_at: string;
  updated_at: string;
}

interface EvidenceRow {
  id: string;
  learning_id: string;
  source_type: string;
  source_id: string;
  observed_at: string;
  weight: number | null;
}

const MIN_MARKET_EVIDENCE = 3;
const MIN_PREFERENCE_EVIDENCE = 3;

function mapLearning(row: LearningRow): WorkspaceLearning {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type as LearningType,
    category: row.category,
    statement: row.statement,
    confidence: row.confidence as LearningConfidence,
    evidenceCount: row.evidence_count,
    status: row.status as LearningStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class LearningService {
  list(workspaceId: string, status?: LearningStatus): WorkspaceLearning[] {
    const rows = status
      ? db.prepare('SELECT * FROM workspace_learnings WHERE workspace_id = ? AND status = ? ORDER BY updated_at DESC').all(workspaceId, status)
      : db.prepare('SELECT * FROM workspace_learnings WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId);
    return (rows as LearningRow[]).map(mapLearning);
  }

  get(id: string, workspaceId: string): (WorkspaceLearning & { evidence: EvidenceRow[] }) | null {
    const row = db.prepare('SELECT * FROM workspace_learnings WHERE id = ?').get(id) as LearningRow | undefined;
    if (!row || row.workspace_id !== workspaceId) return null;
    const evidence = db.prepare('SELECT * FROM learning_evidence WHERE learning_id = ?').all(id) as EvidenceRow[];
    return { ...mapLearning(row), evidence };
  }

  activate(id: string, workspaceId: string): WorkspaceLearning | { error: string; code: string } {
    const row = db.prepare('SELECT * FROM workspace_learnings WHERE id = ?').get(id) as LearningRow | undefined;
    if (!row) return { error: 'Learning not found', code: 'NOT_FOUND' };
    if (row.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };
    const now = new Date().toISOString();
    db.prepare('UPDATE workspace_learnings SET status = ?, updated_at = ? WHERE id = ?').run('ACTIVE', now, id);
    this.syncToBrandBrain(workspaceId);
    return mapLearning(db.prepare('SELECT * FROM workspace_learnings WHERE id = ?').get(id) as LearningRow);
  }

  dismiss(id: string, workspaceId: string): WorkspaceLearning | { error: string; code: string } {
    const row = db.prepare('SELECT * FROM workspace_learnings WHERE id = ?').get(id) as LearningRow | undefined;
    if (!row) return { error: 'Learning not found', code: 'NOT_FOUND' };
    if (row.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };
    const now = new Date().toISOString();
    db.prepare('UPDATE workspace_learnings SET status = ?, updated_at = ? WHERE id = ?').run('DISMISSED', now, id);
    this.syncToBrandBrain(workspaceId);
    return mapLearning(db.prepare('SELECT * FROM workspace_learnings WHERE id = ?').get(id) as LearningRow);
  }

  upsertCandidate(input: {
    workspaceId: string;
    type: LearningType;
    category: string;
    statement: string;
    confidence: LearningConfidence;
    relevanceTags: string[];
    evidence: Array<{ sourceType: string; sourceId: string; weight?: number }>;
  }): WorkspaceLearning | null {
    if (input.evidence.length < (input.type === 'MARKET_PERFORMANCE' ? MIN_MARKET_EVIDENCE : MIN_PREFERENCE_EVIDENCE)) {
      return null;
    }

    const existing = db.prepare(`
      SELECT * FROM workspace_learnings
      WHERE workspace_id = ? AND type = ? AND category = ? AND statement = ? AND status != 'DISMISSED'
    `).get(input.workspaceId, input.type, input.category, input.statement) as LearningRow | undefined;

    const now = new Date().toISOString();
    const id = existing?.id ?? randomUUID();

    if (existing) {
      db.prepare(`
        UPDATE workspace_learnings
        SET evidence_count = ?, confidence = ?, relevance_tags = ?, updated_at = ?
        WHERE id = ?
      `).run(input.evidence.length, input.confidence, JSON.stringify(input.relevanceTags), now, id);
    } else {
      db.prepare(`
        INSERT INTO workspace_learnings
          (id, workspace_id, type, category, statement, confidence, evidence_count, status, relevance_tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'CANDIDATE', ?, ?, ?)
      `).run(
        id,
        input.workspaceId,
        input.type,
        input.category,
        input.statement,
        input.confidence,
        input.evidence.length,
        JSON.stringify(input.relevanceTags),
        now,
        now
      );
    }

    for (const ev of input.evidence) {
      const exists = db.prepare(
        'SELECT id FROM learning_evidence WHERE learning_id = ? AND source_type = ? AND source_id = ?'
      ).get(id, ev.sourceType, ev.sourceId);
      if (!exists) {
        db.prepare(`
          INSERT INTO learning_evidence (id, learning_id, source_type, source_id, observed_at, weight)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(randomUUID(), id, ev.sourceType, ev.sourceId, now, ev.weight ?? 1);
      }
    }

    return mapLearning(db.prepare('SELECT * FROM workspace_learnings WHERE id = ?').get(id) as LearningRow);
  }

  getActiveForContext(workspaceId: string, filters?: {
    objectiveType?: string;
    channels?: string[];
  }): { marketPerformance: string[]; userPreferences: string[] } {
    const rows = db.prepare(
      "SELECT * FROM workspace_learnings WHERE workspace_id = ? AND status = 'ACTIVE' ORDER BY updated_at DESC"
    ).all(workspaceId) as LearningRow[];

    const marketPerformance: string[] = [];
    const userPreferences: string[] = [];

    for (const row of rows) {
      const tags = JSON.parse(row.relevance_tags || '[]') as string[];
      if (filters) {
        const objectiveMatch = !filters.objectiveType || tags.includes(filters.objectiveType) || tags.includes('ALL');
        const channelMatch = !filters.channels?.length || filters.channels.some((c) => tags.includes(c)) || tags.includes('ALL');
        if (!objectiveMatch || !channelMatch) continue;
      }
      if (row.type === 'MARKET_PERFORMANCE') marketPerformance.push(row.statement);
      else userPreferences.push(row.statement);
    }

    return { marketPerformance, userPreferences };
  }

  private syncToBrandBrain(workspaceId: string): void {
    const entity = db.prepare('SELECT brand_kit FROM entities WHERE id = ?').get(workspaceId) as { brand_kit: string } | undefined;
    if (!entity) return;

    let brandKit: Record<string, unknown> = {};
    try { brandKit = JSON.parse(entity.brand_kit) as Record<string, unknown>; } catch { brandKit = {}; }

    const active = this.getActiveForContext(workspaceId);
    const bb = (brandKit.brandBrain ?? {}) as Record<string, unknown>;
    bb.memory = {
      ...(bb.memory as Record<string, unknown> ?? {}),
      marketPerformanceLearnings: active.marketPerformance,
      userPreferenceLearnings: active.userPreferences,
    };
    brandKit.brandBrain = bb;

    db.prepare('UPDATE entities SET brand_kit = ? WHERE id = ?').run(JSON.stringify(brandKit), workspaceId);
  }
}

export const learningService = new LearningService();

export { MIN_MARKET_EVIDENCE, MIN_PREFERENCE_EVIDENCE };
