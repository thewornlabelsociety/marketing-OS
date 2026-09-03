import type {
  ChannelCapability,
  ContentFormat,
  MarketingChannel,
  PlannedContentType,
  PreviewDevice,
} from '../../types/channels';

const CAPABILITIES: Record<MarketingChannel, ChannelCapability> = {
  INSTAGRAM: {
    channel: 'INSTAGRAM',
    supportedContentTypes: ['STATIC_POST', 'CAROUSEL', 'STORY', 'SHORT_VIDEO'],
    supportedFormats: ['SQUARE_1_1', 'PORTRAIT_4_5', 'VERTICAL_9_16'],
    supportedDevices: ['mobile'],
    preferredAspectRatios: ['1:1', '4:5', '9:16'],
    maxMediaItems: 10,
    supportsCarousel: true,
    supportsVideo: true,
    supportsLongForm: false,
    supportsLinks: true,
    supportsStories: true,
  },
  FACEBOOK: {
    channel: 'FACEBOOK',
    supportedContentTypes: ['STATIC_POST', 'CAROUSEL', 'STORY', 'SHORT_VIDEO'],
    supportedFormats: ['SQUARE_1_1', 'PORTRAIT_4_5', 'VERTICAL_9_16', 'LANDSCAPE_16_9'],
    supportedDevices: ['mobile'],
    preferredAspectRatios: ['1:1', '4:5', '9:16', '16:9'],
    maxMediaItems: 10,
    supportsCarousel: true,
    supportsVideo: true,
    supportsLongForm: false,
    supportsLinks: true,
    supportsStories: true,
  },
  TIKTOK: {
    channel: 'TIKTOK',
    supportedContentTypes: ['SHORT_VIDEO', 'TALKING_POINTS'],
    supportedFormats: ['VERTICAL_9_16'],
    supportedDevices: ['mobile'],
    preferredAspectRatios: ['9:16'],
    supportsCarousel: false,
    supportsVideo: true,
    supportsLongForm: false,
    supportsLinks: true,
    supportsStories: false,
  },
  LINKEDIN: {
    channel: 'LINKEDIN',
    supportedContentTypes: ['STATIC_POST', 'DOCUMENT', 'SHORT_VIDEO', 'LONG_VIDEO', 'OTHER'],
    supportedFormats: ['SQUARE_1_1', 'LANDSCAPE_16_9', 'DOCUMENT_CAROUSEL', 'TEXT_POST'],
    supportedDevices: ['mobile', 'desktop'],
    preferredAspectRatios: ['1:1', '16:9'],
    supportsCarousel: true,
    supportsVideo: true,
    supportsLongForm: true,
    supportsLinks: true,
    supportsStories: false,
  },
  EMAIL: {
    channel: 'EMAIL',
    supportedContentTypes: ['NEWSLETTER', 'EMAIL'],
    supportedFormats: ['NEWSLETTER'],
    supportedDevices: ['mobile', 'desktop'],
    supportsCarousel: false,
    supportsVideo: false,
    supportsLongForm: true,
    supportsLinks: true,
    supportsStories: false,
  },
  WEBSITE: {
    channel: 'WEBSITE',
    supportedContentTypes: ['LANDING_PAGE', 'ARTICLE'],
    supportedFormats: ['LANDING_PAGE', 'ARTICLE'],
    supportedDevices: ['mobile', 'desktop'],
    supportsCarousel: false,
    supportsVideo: true,
    supportsLongForm: true,
    supportsLinks: true,
    supportsStories: false,
  },
};

const CHANNELS = new Set<MarketingChannel>(Object.keys(CAPABILITIES) as MarketingChannel[]);

export function isMarketingChannel(value: string): value is MarketingChannel {
  return CHANNELS.has(value as MarketingChannel);
}

export function getChannelCapability(channel: MarketingChannel): ChannelCapability {
  return CAPABILITIES[channel];
}

export function listChannelCapabilities(): ChannelCapability[] {
  return Object.values(CAPABILITIES);
}

export function previewFormatFor(contentType: PlannedContentType): string {
  switch (contentType) {
    case 'CAROUSEL':
      return 'carousel';
    case 'STORY':
      return 'story';
    case 'SHORT_VIDEO':
      return 'short-video';
    case 'LONG_VIDEO':
      return 'video';
    case 'NEWSLETTER':
    case 'EMAIL':
      return 'newsletter';
    case 'ARTICLE':
      return 'article';
    case 'LANDING_PAGE':
      return 'landing';
    case 'DOCUMENT':
      return 'document';
    case 'STATIC_POST':
    default:
      return 'feed';
  }
}

export function previewChannelFor(channel: MarketingChannel): string {
  return channel.toLowerCase();
}

export interface ChannelComboInput {
  channel: string;
  contentType: string;
  format: string;
  deviceTargets?: string[];
}

export function validateChannelCombo(input: ChannelComboInput): string[] {
  const errors: string[] = [];

  if (!isMarketingChannel(input.channel)) {
    errors.push(`Unrecognized channel: ${input.channel}`);
    return errors;
  }

  const cap = CAPABILITIES[input.channel];
  const contentType = input.contentType as PlannedContentType;
  const format = input.format as ContentFormat;

  if (!cap.supportedContentTypes.includes(contentType)) {
    errors.push(`${input.channel} does not support content type ${input.contentType}`);
  }
  if (!cap.supportedFormats.includes(format)) {
    errors.push(`${input.channel} does not support format ${input.format}`);
  }

  const devices = (input.deviceTargets ?? []) as PreviewDevice[];
  for (const device of devices) {
    if (!cap.supportedDevices.includes(device)) {
      errors.push(`${input.channel} does not support device ${device}`);
    }
  }

  if (contentType === 'STORY' && devices.includes('desktop')) {
    errors.push('Stories are not previewable on desktop');
  }

  return errors;
}

export const channelCapabilityRegistry = {
  get: getChannelCapability,
  list: listChannelCapabilities,
  validate: validateChannelCombo,
  previewFormatFor,
  previewChannelFor,
};
