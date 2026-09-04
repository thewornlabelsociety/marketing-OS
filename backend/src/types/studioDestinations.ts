// Shared creative destination contract — Phase 4D
// Single source of truth for supported repurpose destinations and operator studio formats.
// OperatorStudioService derives FORMAT_META from this; RepurposeService imports it directly.

export interface CreativeDestination {
  channel: string;
  contentType: string;
  format: string;
  label: string;
  supportsCreative: boolean;
  supportsScheduling: boolean;
  supportsPublishing: boolean;
}

export const CREATIVE_DESTINATIONS: CreativeDestination[] = [
  { channel: 'INSTAGRAM', contentType: 'STATIC_POST',    format: 'PORTRAIT_4_5',  label: 'Instagram Post',        supportsCreative: true, supportsScheduling: true,  supportsPublishing: true  },
  { channel: 'INSTAGRAM', contentType: 'CAROUSEL',       format: 'PORTRAIT_4_5',  label: 'Instagram Carousel',    supportsCreative: true, supportsScheduling: true,  supportsPublishing: false },
  { channel: 'INSTAGRAM', contentType: 'STORY',          format: 'VERTICAL_9_16', label: 'Instagram Story',       supportsCreative: true, supportsScheduling: true,  supportsPublishing: false },
  { channel: 'FACEBOOK',  contentType: 'STATIC_POST',    format: 'PORTRAIT_4_5',  label: 'Facebook Post',         supportsCreative: true, supportsScheduling: true,  supportsPublishing: true  },
  { channel: 'FACEBOOK',  contentType: 'CAROUSEL',       format: 'PORTRAIT_4_5',  label: 'Facebook Carousel',     supportsCreative: true, supportsScheduling: true,  supportsPublishing: false },
  { channel: 'EMAIL',     contentType: 'EMAIL',          format: 'NEWSLETTER',    label: 'Email',                 supportsCreative: true, supportsScheduling: false, supportsPublishing: false },
  { channel: 'TIKTOK',   contentType: 'TALKING_POINTS', format: 'VERTICAL_9_16', label: 'Reel / TikTok Concept', supportsCreative: true, supportsScheduling: false, supportsPublishing: false },
];

/** Map a channel/contentType pair to its CREATIVE_DESTINATIONS entry. */
export function findDestination(channel: string, contentType: string): CreativeDestination | undefined {
  return CREATIVE_DESTINATIONS.find(d => d.channel === channel && d.contentType === contentType);
}
