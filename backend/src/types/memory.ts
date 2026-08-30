export type MemoryType = 'MARKET_PERFORMANCE' | 'USER_PREFERENCE';

export interface MemoryEntry {
  id: string;
  workspaceId: string;
  memoryType: MemoryType;
  key: string;
  value: string;
  confidence: number; // 0–1
  // All memory is workspace-scoped; never silently promote to global rule
  sourceType: 'CAMPAIGN_RESULT' | 'USER_ACTION' | 'EXPERIMENT';
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketPerformanceMemory {
  winningHookPatterns: string[];
  highConvertingContent: string[];
  strongChannels: string[];
  bestTimings: string[];
  strongOffers: string[];
  successfulCreativeFormats: string[];
}

export interface UserPreferenceMemory {
  approvedPatterns: string[];
  rejectedPatterns: string[];
  dislikedPhrases: string[];
  preferredHooks: string[];
  preferredCtas: string[];
  preferredImageStyle: string | null;
}
