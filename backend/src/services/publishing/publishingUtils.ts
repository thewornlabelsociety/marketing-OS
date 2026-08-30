import type { PublishableAsset } from '../../types/scheduledContent';

export const DEFAULT_SCHEDULE_TIMEZONE = process.env.DEFAULT_SCHEDULE_TIMEZONE ?? 'UTC';

export function buildIdempotencyKey(
  scheduleId: string,
  creativeArtifactId: string,
  creativeVersion: number,
): string {
  return `${scheduleId}:${creativeArtifactId}:${creativeVersion}`;
}

export function contentTypesRequiringMedia(contentType: string, publicationMode: string): boolean {
  if (publicationMode !== 'DIRECT') return false;
  return ['SHORT_VIDEO', 'LONG_VIDEO', 'CAROUSEL', 'STATIC_POST', 'STORY'].includes(contentType);
}

export function hasRequiredPublishableMedia(contentType: string, mediaAssets: PublishableAsset[]): boolean {
  if (!contentTypesRequiringMedia(contentType, 'DIRECT')) return true;
  if (contentType === 'SHORT_VIDEO' || contentType === 'LONG_VIDEO') {
    return mediaAssets.some((a) => a.type === 'VIDEO' || a.mimeType?.startsWith('video/'));
  }
  if (contentType === 'CAROUSEL' || contentType === 'STATIC_POST' || contentType === 'STORY') {
    return mediaAssets.some((a) => a.type === 'IMAGE' || a.mimeType?.startsWith('image/'));
  }
  return true;
}
