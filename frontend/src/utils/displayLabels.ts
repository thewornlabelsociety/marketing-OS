export const CONTENT_TYPE_LABELS: Record<string, string> = {
  STATIC_POST: 'Post',
  CAROUSEL: 'Carousel',
  STORY: 'Story',
  EMAIL: 'Email',
  TALKING_POINTS: 'Reel / TikTok concept',
  NEWSLETTER: 'Newsletter',
};

export const CHANNEL_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  EMAIL: 'Email',
  TIKTOK: 'TikTok',
};

export function contentTypeLabel(value: string): string {
  return CONTENT_TYPE_LABELS[value] ?? titleCase(value.replace(/_/g, ' '));
}

export function channelLabel(value: string): string {
  return CHANNEL_LABELS[value] ?? titleCase(value.replace(/_/g, ' '));
}

export function humanizeCampaignName(name: string, fallbackKey?: string): string {
  if (/^Campaign camp_/.test(name)) {
    return fallbackKey
      ? fallbackKey.replaceAll('-', ' ').replace(/\b\w/g, m => m.toUpperCase())
      : 'Campaign';
  }
  return name;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, m => m.toUpperCase());
}
