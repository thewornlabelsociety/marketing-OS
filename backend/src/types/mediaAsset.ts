export type MediaAssetStatus = 'ACTIVE' | 'DELETED' | 'UNAVAILABLE';

export interface MediaAssetRecord {
  id: string;
  workspaceId: string;
  campaignId?: string;
  contentKey?: string;
  creativeArtifactId?: string;
  creativeVersion?: number;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  width?: number;
  height?: number;
  checksum: string;
  originalFilename?: string;
  status: MediaAssetStatus;
  createdAt: string;
  updatedAt: string;
}

export type MediaValidationCode =
  | 'MEDIA_MISSING'
  | 'MEDIA_INVALID'
  | 'MEDIA_UNAVAILABLE'
  | 'MEDIA_NOT_PUBLICLY_ACCESSIBLE'
  | 'MEDIA_WORKSPACE_MISMATCH'
  | 'MEDIA_VERSION_MISMATCH';

export interface MediaValidationCheck {
  key: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message?: string;
  code?: MediaValidationCode;
}

export interface MediaValidationResult {
  valid: boolean;
  checks: MediaValidationCheck[];
  blockers: MediaValidationCode[];
  warnings: string[];
}

export interface MediaDeliveryMetadata {
  assetIds: string[];
  checksums: string[];
  deliveryUrlGeneratedAt: string;
  tokenTtlSeconds: number;
}
