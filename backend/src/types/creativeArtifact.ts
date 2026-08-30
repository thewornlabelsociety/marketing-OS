import type { ContentFormat, MarketingChannel, PlannedContentType } from './channels';

export type CreativeArtifactStatus =
  | 'GENERATING'
  | 'READY_FOR_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'REVISING'
  | 'READY_FOR_APPROVAL'
  | 'APPROVED';

export interface CreativeQualityCheck {
  key: string;
  status: 'PASS' | 'WARNING' | 'FAIL';
  message?: string;
}

export interface CreativeQualityResult {
  passed: boolean;
  checks: CreativeQualityCheck[];
  warnings: string[];
  repaired?: boolean;
}

export interface StaticPostContent {
  kind: 'STATIC_POST';
  headline?: string;
  caption: string;
  hook?: string;
  cta?: string;
  hashtags?: string[];
  visualDirection?: string;
  accessibilityNotes?: string;
}

export interface CarouselSlide {
  slideNumber: number;
  headline?: string;
  body?: string;
  visualDirection?: string;
}

export interface CarouselContent {
  kind: 'CAROUSEL';
  caption: string;
  slides: CarouselSlide[];
  cta?: string;
  visualDirection?: string;
}

export interface StoryFrame {
  frameNumber: number;
  headline?: string;
  body?: string;
  cta?: string;
  interaction?: { type?: string; prompt?: string };
  visualDirection?: string;
}

export interface StoryContent {
  kind: 'STORY';
  frames: StoryFrame[];
}

export interface ShortVideoScene {
  sceneNumber: number;
  durationSeconds?: number;
  visualDirection: string;
  spokenCopy?: string;
  onScreenText?: string;
}

export interface ShortVideoContent {
  kind: 'SHORT_VIDEO';
  title?: string;
  hook: string;
  durationTargetSeconds?: number;
  scenes: ShortVideoScene[];
  voiceover?: string;
  caption?: string;
  cta?: string;
  shotRequirements?: string[];
}

export interface LongVideoContent {
  kind: 'LONG_VIDEO';
  title: string;
  hook?: string;
  outline: { sectionNumber: number; heading?: string; body: string }[];
  cta?: string;
}

export interface EmailContent {
  kind: 'EMAIL';
  subject: string;
  preheader?: string;
  headline?: string;
  body: string | { sections: { heading?: string; body: string }[] };
  cta?: { label: string; destinationDescription?: string };
  footerNotes?: string;
}

export interface NewsletterContent {
  kind: 'NEWSLETTER';
  subject: string;
  preheader?: string;
  sections: { heading?: string; body: string }[];
  cta?: { label: string; destinationDescription?: string };
  footerNotes?: string;
}

export interface TextPostContent {
  kind: 'TEXT_POST';
  hook?: string;
  body: string;
  cta?: string;
}

export interface ArticleContent {
  kind: 'ARTICLE';
  title: string;
  excerpt?: string;
  sections: { heading?: string; body: string }[];
  cta?: string;
}

export interface LandingPageContent {
  kind: 'LANDING_PAGE';
  hero: {
    eyebrow?: string;
    headline: string;
    supportingText?: string;
    cta?: string;
  };
  sections: { heading?: string; body: string }[];
  closingCta?: string;
}

export type CreativeContent =
  | StaticPostContent
  | CarouselContent
  | StoryContent
  | ShortVideoContent
  | LongVideoContent
  | EmailContent
  | NewsletterContent
  | TextPostContent
  | ArticleContent
  | LandingPageContent;

export interface CreativeArtifact {
  id: string;
  workspaceId: string;
  campaignId: string;
  sourceContentPlanId: string;
  sourceContentPlanVersion: number;
  contentKey: string;
  deliverableId: string;
  version: number;
  channel: MarketingChannel;
  contentType: PlannedContentType;
  format: ContentFormat;
  title?: string;
  content: CreativeContent;
  quality: CreativeQualityResult;
  status: CreativeArtifactStatus;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreativeApproval {
  campaignId: string;
  contentKey: string;
  creativeArtifactId: string;
  approvedVersion: number;
  approvedAt: string;
}

export interface CampaignCreativeSummary {
  contentPlanApproved: boolean;
  totalDeliverables: number;
  generated: number;
  approved: number;
  needsReview: number;
  needsGeneration: number;
  readyForScheduling: boolean;
  deliverables: {
    contentKey: string;
    title: string;
    channel: MarketingChannel;
    contentType: PlannedContentType;
    format: ContentFormat;
    hasCreative: boolean;
    currentVersion: number | null;
    status: CreativeArtifactStatus | null;
    isApproved: boolean;
    artifactId: string | null;
  }[];
}
