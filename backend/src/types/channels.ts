export type MarketingChannel =
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'TIKTOK'
  | 'LINKEDIN'
  | 'EMAIL'
  | 'WEBSITE';

export type PlannedContentType =
  | 'STATIC_POST'
  | 'CAROUSEL'
  | 'STORY'
  | 'SHORT_VIDEO'
  | 'LONG_VIDEO'
  | 'NEWSLETTER'
  | 'EMAIL'
  | 'ARTICLE'
  | 'LANDING_PAGE'
  | 'DOCUMENT'
  | 'TALKING_POINTS'
  | 'OTHER';

export type ContentFormat =
  | 'SQUARE_1_1'
  | 'PORTRAIT_4_5'
  | 'VERTICAL_9_16'
  | 'LANDSCAPE_16_9'
  | 'NEWSLETTER'
  | 'DOCUMENT_CAROUSEL'
  | 'TEXT_POST'
  | 'ARTICLE'
  | 'LANDING_PAGE';

export type PreviewDevice = 'mobile' | 'desktop';

export interface ChannelCapability {
  channel: MarketingChannel;
  supportedContentTypes: PlannedContentType[];
  supportedFormats: ContentFormat[];
  supportedDevices: PreviewDevice[];
  preferredAspectRatios?: string[];
  maxMediaItems?: number;
  supportsCarousel: boolean;
  supportsVideo: boolean;
  supportsLongForm: boolean;
  supportsLinks: boolean;
  supportsStories: boolean;
}
