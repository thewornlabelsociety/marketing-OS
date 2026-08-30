const FORBIDDEN_KEYS = new Set([
  'scheduleId', 'scheduleIds', 'scheduledFor', 'approvalId', 'approvalIds',
  'externalPublishId', 'externalPublishIds', 'providerKey', 'publishAttemptId',
  'observationId', 'conversionId', 'evaluationId', 'campaignPlanId', 'contentPlanId',
  'creativeArtifactId', 'creativeApprovalId',
]);

const FORBIDDEN_PATTERNS = [
  /\b20\d{2}-\d{2}-\d{2}\b/,
  /\bschedule_\w+/i,
  /\bext_\w+/i,
  /\bpublish_\w+/i,
];

export interface QualityGateResult {
  valid: boolean;
  errors: string[];
}

function scanObject(obj: unknown, path = ''): string[] {
  const errors: string[] = [];
  if (obj === null || obj === undefined) return errors;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => errors.push(...scanObject(item, `${path}[${i}]`)));
    return errors;
  }
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) {
        errors.push(`Forbidden execution field: ${path}.${key}`);
      }
      errors.push(...scanObject(value, path ? `${path}.${key}` : key));
    }
    return errors;
  }
  if (typeof obj === 'string') {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(obj) && path.includes('cadence') === false) {
        // Allow dates only in evidence summary as reference, not in patterns
        if (!path.includes('evidenceSummary') && !path.includes('sourceCampaign')) {
          errors.push(`Suspicious execution-specific value at ${path}: ${obj.slice(0, 40)}`);
        }
      }
    }
  }
  return errors;
}

export class BlueprintQualityGate {
  validate(blueprint: {
    strategicPattern: Record<string, unknown>;
    contentPattern: unknown[];
    channelPattern: unknown[];
    cadencePattern?: string | null;
    evidenceSummary: Record<string, unknown>;
    sourceExamples: unknown[];
  }): QualityGateResult {
    const errors: string[] = [];

    if (!blueprint.contentPattern || blueprint.contentPattern.length === 0) {
      errors.push('Content pattern must not be empty');
    }
    if (!blueprint.channelPattern || blueprint.channelPattern.length === 0) {
      errors.push('Channel pattern must not be empty');
    }
    if (!blueprint.evidenceSummary?.sourceCampaignId) {
      errors.push('Evidence summary must reference source campaign');
    }

    errors.push(...scanObject(blueprint.strategicPattern, 'strategicPattern'));
    errors.push(...scanObject(blueprint.contentPattern, 'contentPattern'));
    errors.push(...scanObject(blueprint.cadencePattern, 'cadencePattern'));
    errors.push(...scanObject(blueprint.sourceExamples, 'sourceExamples'));

    // Evidence is allowed to contain evaluationId as audit reference
    const evidenceCopy = { ...blueprint.evidenceSummary };
    delete evidenceCopy.evaluationId;
    errors.push(...scanObject(evidenceCopy, 'evidenceSummary'));

    return { valid: errors.length === 0, errors: [...new Set(errors)] };
  }
}

export const blueprintQualityGate = new BlueprintQualityGate();

export function generalizeOfferText(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  if (/\d+%\s*off/.test(lower) || /until\s+\w+\s+\d+/.test(lower) || /\$\d+/.test(text)) {
    return 'Limited-time launch incentive';
  }
  return text;
}
