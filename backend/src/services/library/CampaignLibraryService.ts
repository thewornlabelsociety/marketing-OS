import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import { getCoreRepositories } from '../../db/core/createCoreRepositories';
import type {
  CampaignLibraryClassification,
  CampaignLibraryRecord,
  LibraryCampaignSummary,
  LibrarySummary,
  SeasonalMetadata,
} from '../../types/library';
import { campaignPerformanceService } from '../performance/CampaignPerformanceService';
import { objectiveEvaluationService } from '../performance/ObjectiveEvaluationService';

interface LibraryRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  classifications: string;
  archived_at: string | null;
  cancellation_reason_type: string | null;
  cancellation_notes: string | null;
  evergreen: number;
  seasonal: string | null;
  blueprint_candidate: number;
  blueprint_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: LibraryRow): CampaignLibraryRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    classifications: JSON.parse(row.classifications || '[]') as CampaignLibraryClassification[],
    archivedAt: row.archived_at ?? undefined,
    cancellationReasonType: row.cancellation_reason_type as CampaignLibraryRecord['cancellationReasonType'],
    cancellationNotes: row.cancellation_notes ?? undefined,
    evergreen: row.evergreen === 1,
    seasonal: row.seasonal ? JSON.parse(row.seasonal) as SeasonalMetadata : undefined,
    blueprintCandidate: row.blueprint_candidate === 1,
    blueprintId: row.blueprint_id ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CampaignLibraryService {
  ensureRecord(campaignId: string, workspaceId: string): CampaignLibraryRecord {
    const existing = db.prepare('SELECT * FROM campaign_library_records WHERE campaign_id = ?').get(campaignId) as LibraryRow | undefined;
    if (existing) return mapRow(existing);

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO campaign_library_records
        (id, workspace_id, campaign_id, classifications, created_at, updated_at)
      VALUES (?, ?, ?, '[]', ?, ?)
    `).run(id, workspaceId, campaignId, now, now);
    return mapRow(db.prepare('SELECT * FROM campaign_library_records WHERE campaign_id = ?').get(campaignId) as LibraryRow);
  }

  async syncClassifications(campaignId: string, workspaceId: string): Promise<CampaignLibraryRecord> {
    const record = this.ensureRecord(campaignId, workspaceId);
    const repos = getCoreRepositories();
    const campaign = await repos.campaign.findById(campaignId);
    if (!campaign || campaign.workspace_id !== workspaceId) return record;

    const classifications = new Set<CampaignLibraryClassification>(record.classifications);

    if (campaign.status === 'COMPLETE') classifications.add('COMPLETED');
    if (campaign.status === 'CANCELLED') classifications.add('CANCELLED');
    if (campaign.status === 'ARCHIVED' || record.archivedAt) classifications.add('ARCHIVED');
    if (record.evergreen) classifications.add('EVERGREEN');
    if (record.seasonal) classifications.add('SEASONAL');
    if (record.blueprintId) classifications.add('BLUEPRINT');

    const evaluation = objectiveEvaluationService.getLatestEvaluation(campaignId);
    if (evaluation) {
      if (evaluation.classification === 'HIGH_PERFORMING' || evaluation.classification === 'EXCEPTIONAL') {
        classifications.add('HIGH_PERFORMING');
        classifications.delete('LOW_PERFORMING');
      } else if (evaluation.classification === 'LOW_PERFORMING' || evaluation.classification === 'BELOW_AVERAGE') {
        classifications.add('LOW_PERFORMING');
      }
    }

    const perfSummary = await campaignPerformanceService.getSummary(campaignId, workspaceId);
    let blueprintCandidate = false;
    if (!('error' in perfSummary)) {
      blueprintCandidate = Boolean(
        perfSummary.blueprintCandidate &&
        (perfSummary.classification === 'HIGH_PERFORMING' || perfSummary.classification === 'EXCEPTIONAL') &&
        perfSummary.confidence !== 'LOW'
      );
      if (blueprintCandidate) classifications.add('BLUEPRINT_CANDIDATE');
      else classifications.delete('BLUEPRINT_CANDIDATE');
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE campaign_library_records
      SET classifications = ?, blueprint_candidate = ?, updated_at = ?
      WHERE campaign_id = ?
    `).run(JSON.stringify([...classifications]), blueprintCandidate ? 1 : 0, now, campaignId);

    return mapRow(db.prepare('SELECT * FROM campaign_library_records WHERE campaign_id = ?').get(campaignId) as LibraryRow);
  }

  async list(workspaceId: string, filters?: {
    classification?: CampaignLibraryClassification;
    search?: string;
    includeArchived?: boolean;
    sort?: 'newest' | 'oldest' | 'best';
  }): Promise<LibraryCampaignSummary[]> {
    const repos = getCoreRepositories();
    const campaigns = await repos.campaign.list({
      workspaceId,
      statusIn: ['COMPLETE', 'CANCELLED', 'ARCHIVED', 'PUBLISHED', 'MEASURING'],
    });

    const results: LibraryCampaignSummary[] = [];

    for (const c of campaigns) {
      const record = await this.syncClassifications(c.id, workspaceId);
      if (!filters?.includeArchived && record.archivedAt) continue;
      if (filters?.classification && !record.classifications.includes(filters.classification)) continue;

      const objective = await repos.objective.findById(c.objective_id);

      const search = filters?.search?.toLowerCase();
      if (search) {
        const haystack = `${c.name} ${c.source_title ?? ''} ${objective?.name ?? ''} ${record.notes ?? ''}`.toLowerCase();
        if (!haystack.includes(search)) continue;
      }

      const perf = await campaignPerformanceService.getSummary(c.id, workspaceId);
      results.push({
        libraryRecord: record,
        campaignId: c.id,
        campaignName: c.name,
        objectiveType: objective?.objective_type ?? '',
        objectiveName: objective?.name ?? '',
        primaryKpi: objective?.primary_kpi ?? '',
        lifecycleStatus: c.status,
        primaryKpiValue: !('error' in perf) ? perf.primaryKpiValue : null,
        performanceClassification: !('error' in perf) ? perf.classification : undefined,
        channels: JSON.parse(c.channels || '[]') as string[],
        completedAt: c.completed_at ?? undefined,
        sourceTitle: c.source_title,
        sourceType: c.source_type,
      });
    }

    if (filters?.sort === 'oldest') results.reverse();
    if (filters?.sort === 'best') {
      const tier: Record<string, number> = {
        EXCEPTIONAL: 6, HIGH_PERFORMING: 5, ABOVE_AVERAGE: 4, AVERAGE: 3, BELOW_AVERAGE: 2, LOW_PERFORMING: 1, INSUFFICIENT_DATA: 0,
      };
      results.sort((a, b) => (tier[b.performanceClassification ?? ''] ?? 0) - (tier[a.performanceClassification ?? ''] ?? 0));
    }

    return results;
  }

  async get(campaignId: string, workspaceId: string): Promise<LibraryCampaignSummary | { error: string; code: string }> {
    const repos = getCoreRepositories();
    const c = await repos.campaign.findById(campaignId);
    if (!c) return { error: 'Campaign not found', code: 'NOT_FOUND' };
    if (c.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    const objective = await repos.objective.findById(c.objective_id);
    const record = await this.syncClassifications(campaignId, workspaceId);
    const perf = await campaignPerformanceService.getSummary(campaignId, workspaceId);
    return {
      libraryRecord: record,
      campaignId: c.id,
      campaignName: c.name,
      objectiveType: objective?.objective_type ?? '',
      objectiveName: objective?.name ?? '',
      primaryKpi: objective?.primary_kpi ?? '',
      lifecycleStatus: c.status,
      primaryKpiValue: !('error' in perf) ? perf.primaryKpiValue : null,
      performanceClassification: !('error' in perf) ? perf.classification : undefined,
      channels: JSON.parse(c.channels || '[]') as string[],
      completedAt: c.completed_at ?? undefined,
      sourceTitle: c.source_title,
      sourceType: c.source_type,
    };
  }

  async archive(campaignId: string, workspaceId: string): Promise<CampaignLibraryRecord | { error: string; code: string }> {
    const repos = getCoreRepositories();
    const campaign = await repos.campaign.findById(campaignId);
    if (!campaign || campaign.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    this.ensureRecord(campaignId, workspaceId);
    const now = new Date().toISOString();
    const record = mapRow(db.prepare('SELECT * FROM campaign_library_records WHERE campaign_id = ?').get(campaignId) as LibraryRow);
    const classifications = new Set([...record.classifications, 'ARCHIVED' as CampaignLibraryClassification]);
    db.prepare(`
      UPDATE campaign_library_records SET archived_at = ?, classifications = ?, updated_at = ? WHERE campaign_id = ?
    `).run(now, JSON.stringify([...classifications]), now, campaignId);
    db.prepare('UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?').run('ARCHIVED', now, campaignId);

    return mapRow(db.prepare('SELECT * FROM campaign_library_records WHERE campaign_id = ?').get(campaignId) as LibraryRow);
  }

  async restore(campaignId: string, workspaceId: string): Promise<CampaignLibraryRecord | { error: string; code: string }> {
    const repos = getCoreRepositories();
    const campaign = await repos.campaign.findById(campaignId);
    if (!campaign || campaign.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    const record = this.ensureRecord(campaignId, workspaceId);
    const classifications = record.classifications.filter((c) => c !== 'ARCHIVED');
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE campaign_library_records SET archived_at = NULL, classifications = ?, updated_at = ? WHERE campaign_id = ?
    `).run(JSON.stringify(classifications), now, campaignId);

    const restoreStatus = classifications.includes('CANCELLED') ? 'CANCELLED' : 'COMPLETE';
    db.prepare('UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?').run(restoreStatus, now, campaignId);

    return await this.syncClassifications(campaignId, workspaceId);
  }

  async markEvergreen(campaignId: string, workspaceId: string, notes?: string): Promise<CampaignLibraryRecord | { error: string; code: string }> {
    const repos = getCoreRepositories();
    const campaign = await repos.campaign.findById(campaignId);
    if (!campaign || campaign.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    const record = this.ensureRecord(campaignId, workspaceId);
    const classifications = new Set([...record.classifications, 'EVERGREEN' as CampaignLibraryClassification]);
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE campaign_library_records
      SET evergreen = 1, classifications = ?, notes = COALESCE(?, notes), updated_at = ?
      WHERE campaign_id = ?
    `).run(JSON.stringify([...classifications]), notes ?? null, now, campaignId);

    return mapRow(db.prepare('SELECT * FROM campaign_library_records WHERE campaign_id = ?').get(campaignId) as LibraryRow);
  }

  async markSeasonal(campaignId: string, workspaceId: string, seasonal: SeasonalMetadata): Promise<CampaignLibraryRecord | { error: string; code: string }> {
    const repos = getCoreRepositories();
    const campaign = await repos.campaign.findById(campaignId);
    if (!campaign || campaign.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    const record = this.ensureRecord(campaignId, workspaceId);
    const classifications = new Set([...record.classifications, 'SEASONAL' as CampaignLibraryClassification]);
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE campaign_library_records
      SET seasonal = ?, classifications = ?, updated_at = ?
      WHERE campaign_id = ?
    `).run(JSON.stringify(seasonal), JSON.stringify([...classifications]), now, campaignId);

    return mapRow(db.prepare('SELECT * FROM campaign_library_records WHERE campaign_id = ?').get(campaignId) as LibraryRow);
  }

  async setCancellationMetadata(
    campaignId: string,
    workspaceId: string,
    input: { reasonType: string; notes?: string }
  ): Promise<CampaignLibraryRecord | { error: string; code: string }> {
    const repos = getCoreRepositories();
    const campaign = await repos.campaign.findById(campaignId);
    if (!campaign || campaign.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    this.ensureRecord(campaignId, workspaceId);
    const now = new Date().toISOString();
    const reasonText = `${input.reasonType}${input.notes ? `: ${input.notes}` : ''}`;
    db.prepare('UPDATE campaigns SET cancellation_reason = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(reasonText, 'CANCELLED', now, campaignId);
    db.prepare(`
      UPDATE campaign_library_records
      SET cancellation_reason_type = ?, cancellation_notes = ?, updated_at = ?
      WHERE campaign_id = ?
    `).run(input.reasonType, input.notes ?? null, now, campaignId);

    return await this.syncClassifications(campaignId, workspaceId);
  }

  async getSummary(workspaceId: string): Promise<LibrarySummary> {
    const items = await this.list(workspaceId, { includeArchived: true });
    return {
      total: items.length,
      highPerforming: items.filter((i) => i.libraryRecord.classifications.includes('HIGH_PERFORMING')).length,
      lowPerforming: items.filter((i) => i.libraryRecord.classifications.includes('LOW_PERFORMING')).length,
      evergreen: items.filter((i) => i.libraryRecord.evergreen).length,
      seasonal: items.filter((i) => i.libraryRecord.seasonal).length,
      blueprints: items.filter((i) => i.libraryRecord.blueprintId).length,
      cancelled: items.filter((i) => i.libraryRecord.classifications.includes('CANCELLED')).length,
      archived: items.filter((i) => i.libraryRecord.archivedAt).length,
    };
  }
}

export const campaignLibraryService = new CampaignLibraryService();
