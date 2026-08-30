export type AssetType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'FONT' | 'OTHER';

export interface Asset {
  id: string;
  workspaceId: string;
  campaignId: string | null;
  assetType: AssetType;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  storagePath: string;
  isOriginal: boolean; // original media is immutable
  derivedFromId: string | null;
  tags: string[];
  createdAt: string;
}
