export interface BrandBrain {
  workspaceId: string;
  displayName: string;
  tagline: string | null;
  voice: string[];
  toneAdjectives: string[];
  bannedWords: string[];
  preferredWords: string[];
  audienceDescription: string | null;
  visualStyle: VisualStyle;
  topPerformingHooks: string[];
  userPreferences: string[];
  updatedAt: string;
}

export interface VisualStyle {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  typography: Typography;
}

export interface Typography {
  heading: string | null;
  body: string | null;
}
