import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import type { ObjectiveRow } from '../../types';
import type { CampaignBlueprint, BlueprintStatus, BlueprintUsage } from '../../types/blueprint';
import { blueprintExtractionService } from './BlueprintExtractionService';
import { blueprintQualityGate } from './BlueprintQualityGate';
import { campaignLibraryService } from './CampaignLibraryService';

interface BlueprintRow {
  id: string;
  workspace_id: string;
  source_campaign_id: string;
  name: string;
  description: string | null;
  objective_type: string;
  status: string;
  current_version: number;
  created_at: string;
  updated_at: string;
}

interface VersionRow {
  id: string;
  blueprint_id: string;
  version: number;
  strategic_pattern: string;
  content_pattern: string;
  channel_pattern: string;
  cadence_pattern: string | null;
  evidence_summary: string;
  source_examples: string;
  learned_why: string;
  created_at: string;
}

function loadBlueprint(row: BlueprintRow, versionRow: VersionRow): CampaignBlueprint {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourceCampaignId: row.source_campaign_id,
    name: row.name,
    description: row.description ?? undefined,
    objectiveType: row.objective_type,
    status: row.status as BlueprintStatus,
    currentVersion: row.current_version,
    strategicPattern: JSON.parse(versionRow.strategic_pattern),
    contentPattern: JSON.parse(versionRow.content_pattern),
    channelPattern: JSON.parse(versionRow.channel_pattern),
    cadencePattern: versionRow.cadence_pattern ?? undefined,
    evidenceSummary: JSON.parse(versionRow.evidence_summary),
    sourceExamples: JSON.parse(versionRow.source_examples),
    learnedWhy: JSON.parse(versionRow.learned_why),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BlueprintService {
  get(blueprintId: string, workspaceId: string, version?: number): CampaignBlueprint | { error: string; code: string } {
    const row = db.prepare('SELECT * FROM campaign_blueprints WHERE id = ?').get(blueprintId) as BlueprintRow | undefined;
    if (!row) return { error: 'Blueprint not found', code: 'NOT_FOUND' };
    if (row.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    const ver = version ?? row.current_version;
    const versionRow = db.prepare(
      'SELECT * FROM campaign_blueprint_versions WHERE blueprint_id = ? AND version = ?'
    ).get(blueprintId, ver) as VersionRow | undefined;
    if (!versionRow) return { error: 'Blueprint version not found', code: 'NOT_FOUND' };

    return loadBlueprint(row, versionRow);
  }

  list(workspaceId: string, status?: BlueprintStatus): CampaignBlueprint[] {
    const rows = status
      ? db.prepare('SELECT * FROM campaign_blueprints WHERE workspace_id = ? AND status = ? ORDER BY updated_at DESC').all(workspaceId, status)
      : db.prepare('SELECT * FROM campaign_blueprints WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId);
    return (rows as BlueprintRow[]).map((row) => {
      const versionRow = db.prepare(
        'SELECT * FROM campaign_blueprint_versions WHERE blueprint_id = ? AND version = ?'
      ).get(row.id, row.current_version) as VersionRow;
      return loadBlueprint(row, versionRow);
    });
  }

  createFromCampaign(sourceCampaignId: string, workspaceId: string, name?: string): CampaignBlueprint | { error: string; code: string } {
    const extracted = blueprintExtractionService.extract(sourceCampaignId, workspaceId);
    if ('error' in extracted) return extracted;

    const gate = blueprintQualityGate.validate({
      strategicPattern: extracted.strategicPattern as Record<string, unknown>,
      contentPattern: extracted.contentPattern,
      channelPattern: extracted.channelPattern,
      cadencePattern: extracted.cadencePattern,
      evidenceSummary: extracted.evidenceSummary as unknown as Record<string, unknown>,
      sourceExamples: extracted.sourceExamples,
    });
    if (!gate.valid) return { error: gate.errors.join('; '), code: 'BLUEPRINT_VALIDATION_FAILED' };

    const perf = campaignLibraryService.syncClassifications(sourceCampaignId, workspaceId);
    if (!perf.blueprintCandidate && !perf.classifications.includes('HIGH_PERFORMING')) {
      // Allow manual create from high performer even if candidate flag not set yet
      const evaluation = extracted.evidenceSummary.classification;
      if (evaluation !== 'HIGH_PERFORMING' && evaluation !== 'EXCEPTIONAL') {
        return { error: 'Insufficient performance evidence for blueprint', code: 'INSUFFICIENT_EVIDENCE' };
      }
    }

    const id = randomUUID();
    const versionId = randomUUID();
    const now = new Date().toISOString();
    const bpName = name ?? extracted.name;

    db.prepare(`
      INSERT INTO campaign_blueprints
        (id, workspace_id, source_campaign_id, name, description, objective_type, status, current_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', 1, ?, ?)
    `).run(id, workspaceId, sourceCampaignId, bpName, extracted.description ?? null, extracted.objectiveType, now, now);

    db.prepare(`
      INSERT INTO campaign_blueprint_versions
        (id, blueprint_id, version, strategic_pattern, content_pattern, channel_pattern, cadence_pattern,
         evidence_summary, source_examples, learned_why, created_at)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      versionId, id,
      JSON.stringify(extracted.strategicPattern),
      JSON.stringify(extracted.contentPattern),
      JSON.stringify(extracted.channelPattern),
      extracted.cadencePattern ?? null,
      JSON.stringify(extracted.evidenceSummary),
      JSON.stringify(extracted.sourceExamples),
      JSON.stringify(extracted.learnedWhy),
      now
    );

    db.prepare(`
      UPDATE campaign_library_records SET blueprint_id = ?, updated_at = ? WHERE campaign_id = ?
    `).run(id, now, sourceCampaignId);

    return this.get(id, workspaceId)! as CampaignBlueprint;
  }

  activate(blueprintId: string, workspaceId: string): CampaignBlueprint | { error: string; code: string } {
    const bp = this.get(blueprintId, workspaceId);
    if ('error' in bp) return bp;

    const gate = blueprintQualityGate.validate({
      strategicPattern: bp.strategicPattern as Record<string, unknown>,
      contentPattern: bp.contentPattern,
      channelPattern: bp.channelPattern,
      cadencePattern: bp.cadencePattern,
      evidenceSummary: bp.evidenceSummary as unknown as Record<string, unknown>,
      sourceExamples: bp.sourceExamples,
    });
    if (!gate.valid) return { error: gate.errors.join('; '), code: 'BLUEPRINT_VALIDATION_FAILED' };

    const now = new Date().toISOString();
    db.prepare('UPDATE campaign_blueprints SET status = ?, updated_at = ? WHERE id = ?').run('ACTIVE', now, blueprintId);

    const record = campaignLibraryService.ensureRecord(bp.sourceCampaignId, workspaceId);
    const classifications = new Set([...record.classifications, 'BLUEPRINT' as import('../../types/library').CampaignLibraryClassification]);
    db.prepare(`
      UPDATE campaign_library_records SET blueprint_id = ?, classifications = ?, updated_at = ? WHERE campaign_id = ?
    `).run(blueprintId, JSON.stringify([...classifications]), now, bp.sourceCampaignId);

    return this.get(blueprintId, workspaceId)! as CampaignBlueprint;
  }

  archive(blueprintId: string, workspaceId: string): CampaignBlueprint | { error: string; code: string } {
    const bp = this.get(blueprintId, workspaceId);
    if ('error' in bp) return bp;
    const now = new Date().toISOString();
    db.prepare('UPDATE campaign_blueprints SET status = ?, updated_at = ? WHERE id = ?').run('ARCHIVED', now, blueprintId);
    return this.get(blueprintId, workspaceId)! as CampaignBlueprint;
  }

  update(
    blueprintId: string,
    workspaceId: string,
    patch: { name?: string; description?: string; strategicPattern?: Record<string, unknown>; contentPattern?: unknown[]; channelPattern?: string[]; cadencePattern?: string }
  ): CampaignBlueprint | { error: string; code: string } {
    const current = this.get(blueprintId, workspaceId);
    if ('error' in current) return current;

    const now = new Date().toISOString();
    const newVersion = current.currentVersion + 1;
    const versionId = randomUUID();

    const strategicPattern = patch.strategicPattern ?? current.strategicPattern;
    const contentPattern = patch.contentPattern ?? current.contentPattern;
    const channelPattern = patch.channelPattern ?? current.channelPattern;
    const cadencePattern = patch.cadencePattern ?? current.cadencePattern;

    db.prepare(`
      INSERT INTO campaign_blueprint_versions
        (id, blueprint_id, version, strategic_pattern, content_pattern, channel_pattern, cadence_pattern,
         evidence_summary, source_examples, learned_why, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      versionId, blueprintId, newVersion,
      JSON.stringify(strategicPattern),
      JSON.stringify(contentPattern),
      JSON.stringify(channelPattern),
      cadencePattern ?? null,
      JSON.stringify(current.evidenceSummary),
      JSON.stringify(current.sourceExamples),
      JSON.stringify(current.learnedWhy),
      now
    );

    db.prepare(`
      UPDATE campaign_blueprints
      SET name = COALESCE(?, name), description = COALESCE(?, description), current_version = ?, updated_at = ?
      WHERE id = ?
    `).run(patch.name ?? null, patch.description ?? null, newVersion, now, blueprintId);

    return this.get(blueprintId, workspaceId)! as CampaignBlueprint;
  }

  use(
    blueprintId: string,
    workspaceId: string,
    input: {
      sourceType: string;
      sourceTitle: string;
      sourceDescription?: string;
      objectiveId?: string;
      name?: string;
    }
  ): { campaignId: string; usageId: string } | { error: string; code: string } {
    const bp = this.get(blueprintId, workspaceId);
    if ('error' in bp) return bp;
    if (bp.status !== 'ACTIVE') return { error: 'Blueprint must be ACTIVE to use', code: 'BLUEPRINT_NOT_ACTIVE' };

    let objectiveId = input.objectiveId;
    if (!objectiveId) {
      const obj = db.prepare(`
        SELECT id FROM objectives WHERE objective_type = ? AND (workspace_id IS NULL OR workspace_id = ?) AND is_active = 1 LIMIT 1
      `).get(bp.objectiveType, workspaceId) as { id: string } | undefined;
      if (!obj) return { error: 'No matching objective found', code: 'OBJECTIVE_NOT_FOUND' };
      objectiveId = obj.id;
    }

    const objective = db.prepare('SELECT * FROM objectives WHERE id = ?').get(objectiveId) as ObjectiveRow | undefined;
    if (!objective) return { error: 'Objective not found', code: 'OBJECTIVE_NOT_FOUND' };
    if (objective.is_system !== 1 && objective.workspace_id !== workspaceId) {
      return { error: 'Objective workspace mismatch', code: 'FORBIDDEN' };
    }

    const campaignId = `campaign_${randomUUID()}`;
    const usageId = randomUUID();
    const now = new Date().toISOString();
    const campaignName = input.name?.trim() || input.sourceTitle;

    const blueprintContext = {
      blueprintId: bp.id,
      blueprintVersion: bp.currentVersion,
      blueprintName: bp.name,
      strategicPattern: bp.strategicPattern,
      contentPattern: bp.contentPattern,
      channelPattern: bp.channelPattern,
      cadencePattern: bp.cadencePattern,
      evidenceSummary: bp.evidenceSummary,
      learnedWhy: bp.learnedWhy,
    };

    db.prepare(`
      INSERT INTO campaigns
        (id, workspace_id, objective_id, name, status, source_type, source_title, source_description,
         source_metadata, channels, source_blueprint_id, source_blueprint_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'DRAFTING', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      campaignId,
      workspaceId,
      objectiveId,
      campaignName,
      input.sourceType,
      input.sourceTitle,
      input.sourceDescription ?? null,
      JSON.stringify({ blueprintContext }),
      JSON.stringify(bp.channelPattern),
      bp.id,
      bp.currentVersion,
      now,
      now
    );

    db.prepare(`
      INSERT INTO blueprint_usages (id, workspace_id, blueprint_id, blueprint_version, campaign_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(usageId, workspaceId, blueprintId, bp.currentVersion, campaignId, now);

    return { campaignId, usageId };
  }

  getUsages(blueprintId: string, workspaceId: string): BlueprintUsage[] | { error: string; code: string } {
    const bp = db.prepare('SELECT workspace_id FROM campaign_blueprints WHERE id = ?').get(blueprintId) as { workspace_id: string } | undefined;
    if (!bp) return { error: 'Blueprint not found', code: 'NOT_FOUND' };
    if (bp.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    const rows = db.prepare(
      'SELECT * FROM blueprint_usages WHERE blueprint_id = ? ORDER BY created_at DESC'
    ).all(blueprintId) as Array<{ id: string; workspace_id: string; blueprint_id: string; blueprint_version: number; campaign_id: string; created_at: string }>;

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      blueprintId: r.blueprint_id,
      blueprintVersion: r.blueprint_version,
      campaignId: r.campaign_id,
      createdAt: r.created_at,
    }));
  }

  suggest(workspaceId: string, input: { objectiveType?: string; sourceType?: string; channels?: string[] }): CampaignBlueprint[] {
    const all = this.list(workspaceId, 'ACTIVE');
    return all.filter((bp) => {
      if (input.objectiveType && bp.objectiveType !== input.objectiveType) return false;
      if (input.channels?.length && !input.channels.some((c) => bp.channelPattern.includes(c))) return false;
      return true;
    }).slice(0, 5);
  }
}

export const blueprintService = new BlueprintService();
