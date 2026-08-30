export type ContentType =
  | 'POST'
  | 'CAROUSEL'
  | 'STORY'
  | 'REEL'
  | 'VIDEO'
  | 'EMAIL'
  | 'AD_COPY'
  | 'CAPTION'
  | 'HOOK'
  | 'CTA'
  | 'BLOG'
  | 'OTHER';

export type ContentStatus = 'DRAFT' | 'READY_FOR_REVIEW' | 'CHANGES_REQUESTED' | 'REVISING' | 'READY_FOR_APPROVAL' | 'APPROVED';

export interface ContentItem {
  id: string;
  workspaceId: string;
  campaignId: string;
  contentType: ContentType;
  channel: string | null;
  title: string | null;
  body: string | null;
  hook: string | null;
  cta: string | null;
  assetIds: string[];
  status: ContentStatus;
  versionNumber: number;
  parentVersionId: string | null;
  qualityCheckPassed: boolean | null;
  qualityIssues: QualityIssue[];
  createdAt: string;
  updatedAt: string;
}

export interface QualityIssue {
  rule: string;
  message: string;
  autoRepaired: boolean;
}
