export interface Audience {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  demographics: AudienceDemographics | null;
  interests: string[];
  painPoints: string[];
  channels: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AudienceDemographics {
  ageRange: string | null;
  locations: string[];
  income: string | null;
  other: Record<string, unknown>;
}
