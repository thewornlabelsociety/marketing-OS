export type ApprovalStatus =
  | 'PENDING'
  | 'CHANGES_REQUESTED'
  | 'READY_FOR_APPROVAL'
  | 'APPROVED';

export type ApprovalTarget = 'CAMPAIGN' | 'CONTENT_ITEM';

export interface Approval {
  id: string;
  workspaceId: string;
  targetType: ApprovalTarget;
  targetId: string;
  status: ApprovalStatus;
  revisionNotes: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Revision {
  id: string;
  approvalId: string;
  targetType: ApprovalTarget;
  targetId: string;
  instructions: string;
  // scope is explicit — only change what is requested
  scope: 'TARGETED' | 'FULL_REGENERATION';
  createdAt: string;
}
