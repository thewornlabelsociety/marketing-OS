import type {
  ExperimentMode,
  ExperimentQualityFinding,
  ExperimentQualityResult,
  ExperimentVariableType,
  ExperimentVariant,
} from '../../types/experiment';

const EXPLORATORY_VARIABLES = new Set<ExperimentVariableType>(['CUSTOM', 'CHANNEL', 'CONTENT_SEQUENCE', 'SEND_TIME', 'POST_TIME']);

export interface VariantDesignInput {
  label: string;
  role: 'CONTROL' | 'VARIANT';
  contentKey: string;
  channel: string;
  offerFraming?: string;
  format?: string;
  audience?: string;
  description?: string;
}

export class ExperimentQualityGate {
  validate(input: {
    variableType: ExperimentVariableType;
    mode: ExperimentMode;
    controlDescription: string;
    variantDescription: string;
    variants: ExperimentVariant[] | VariantDesignInput[];
    campaignObjectiveType?: string;
    campaignPrimaryKpi?: string;
    experimentKpi?: string;
  }): ExperimentQualityResult {
    const findings: ExperimentQualityFinding[] = [];
    const variantInputs = input.variants as VariantDesignInput[];

    if (variantInputs.length < 2) {
      findings.push({ code: 'INSUFFICIENT_VARIANTS', message: 'Experiment requires at least control and one variant.', severity: 'ERROR' });
    }

    const channels = new Set(variantInputs.map((v) => v.channel));
    if (channels.size > 1) {
      findings.push({
        code: 'CHANNEL_MISMATCH',
        message: 'Variants use different channels — not a controlled single-variable test.',
        severity: EXPLORATORY_VARIABLES.has(input.variableType) ? 'WARNING' : 'ERROR',
      });
    }

    const offers = new Set(variantInputs.map((v) => v.offerFraming).filter(Boolean));
    if (offers.size > 1 && input.variableType !== 'OFFER_FRAMING') {
      findings.push({
        code: 'OFFER_MISMATCH',
        message: 'Variants appear to use different offers while variable is not OFFER_FRAMING.',
        severity: 'ERROR',
      });
    }

    const formats = new Set(variantInputs.map((v) => v.format).filter(Boolean));
    if (formats.size > 1 && input.variableType !== 'CREATIVE_FORMAT' && input.variableType !== 'VISUAL_STYLE') {
      findings.push({
        code: 'FORMAT_MISMATCH',
        message: 'Variants use different formats while variable is not format-related.',
        severity: 'ERROR',
      });
    }

    const audiences = new Set(variantInputs.map((v) => v.audience).filter(Boolean));
    if (audiences.size > 1) {
      findings.push({ code: 'AUDIENCE_MISMATCH', message: 'Variants target different audiences.', severity: 'ERROR' });
    }

    const contentKeys = new Set(variantInputs.map((v) => v.contentKey));
    if (contentKeys.size > 1 && !['CHANNEL', 'CONTENT_SEQUENCE', 'CUSTOM'].includes(input.variableType)) {
      // Different content keys OK for hook tests on same deliverable slot if channel/format match
      const sameChannel = channels.size === 1;
      if (!sameChannel) {
        findings.push({
          code: 'MULTIPLE_VARIABLES_CHANGED',
          message: 'Variants use different content keys and channels — likely multiple variables changed.',
          severity: 'ERROR',
        });
      }
    }

    if (input.mode === 'CONTROLLED_SPLIT') {
      findings.push({
        code: 'CONTROLLED_SPLIT_UNAVAILABLE',
        message: 'CONTROLLED_SPLIT requires provider-confirmed randomized delivery. Use OBSERVATIONAL_COMPARISON or MANUAL unless split capability is verified.',
        severity: 'ERROR',
      });
    }

    if (input.mode === 'OBSERVATIONAL_COMPARISON') {
      findings.push({
        code: 'OBSERVATIONAL_WARNING',
        message: 'This comparison was not delivered as a randomized audience split. Differences in timing or audience may influence the result.',
        severity: 'WARNING',
      });
    }

    if (EXPLORATORY_VARIABLES.has(input.variableType)) {
      findings.push({
        code: 'EXPLORATORY_VARIABLE',
        message: 'Exploratory variable type — lower confidence comparison expected.',
        severity: 'WARNING',
      });
    }

    const errors = findings.filter((f) => f.severity === 'ERROR');
    return { valid: errors.length === 0, findings };
  }
}

export const experimentQualityGate = new ExperimentQualityGate();
