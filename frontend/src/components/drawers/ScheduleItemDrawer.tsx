import { ExternalLink, Image, Info, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import type { MarketingChannel, PublicationMode, PublishingDestination, ScheduledContentItem } from '../../types';
import {
  formatDateTimeInTz,
  getDateStrInTz,
  getTimePartsInTz,
  wallClockToISO,
} from '../../utils/timezone';

interface BaseProps {
  campaignId: string;
  workspaceId: string;
  campaignName: string;
  onClose: () => void;
  onSaved: () => void;
  onNavigateToCampaign?: (campaignId: string) => void;
}

interface CreateProps extends BaseProps {
  mode: 'create';
  contentKey: string;
  channel: MarketingChannel;
  creativeArtifactId: string;
  creativeVersion: number;
  item?: never;
}

interface ViewProps extends BaseProps {
  mode: 'view';
  item: ScheduledContentItem;
  contentKey?: never;
  channel?: never;
  creativeArtifactId?: never;
  creativeVersion?: never;
}

type Props = CreateProps | ViewProps;

type PinnedMedia = { id: string; type: string; mimeType?: string; storageKey?: string; checksum?: string };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Returns true when the schedule item has an unresolved unknown publish outcome.
 * Uses the canonical `reconciliationRequired` field when available; falls back to
 * the `blockReason` text for older API responses.
 */
function isUnknownOutcome(item: ScheduledContentItem): boolean {
  if (item.reconciliationRequired !== undefined) return !!item.reconciliationRequired;
  return item.status === 'FAILED' && !!item.blockReason?.toLowerCase().includes('reconcile');
}

export function ScheduleItemDrawer(props: Props) {
  const { campaignId, workspaceId, campaignName, onClose, onSaved, mode, onNavigateToCampaign } = props;
  const contentKey = mode === 'create' ? props.contentKey : props.item.contentKey;
  const channel = mode === 'create' ? props.channel : props.item.channel;
  const creativeVersion = mode === 'create' ? props.creativeVersion : props.item.sourceCreativeVersion;
  const creativeArtifactId = mode === 'create' ? props.creativeArtifactId : props.item.sourceCreativeArtifactId;

  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [publicationMode, setPublicationMode] = useState<PublicationMode>('MANUAL');
  const [destinationId, setDestinationId] = useState('');
  const [destinations, setDestinations] = useState<PublishingDestination[]>([]);
  const [pinnedMedia, setPinnedMedia] = useState<PinnedMedia | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('09:00');

  useEffect(() => {
    if (mode === 'view' && props.item) {
      const tz = props.item.timezone;
      // Show date/time in the item's stored timezone, not the browser's local timezone
      setDate(getDateStrInTz(props.item.scheduledFor, tz));
      const { hour, minute } = getTimePartsInTz(props.item.scheduledFor, tz);
      setTime(`${pad2(hour)}:${pad2(minute)}`);
      setRescheduleDate(getDateStrInTz(props.item.scheduledFor, tz));
      setRescheduleTime(`${pad2(hour)}:${pad2(minute)}`);
      setTimezone(tz);
      setPublicationMode(props.item.publicationMode);
      setDestinationId(props.item.destinationId ?? '');
      const asset = props.item.mediaAssets[0];
      if (asset) setPinnedMedia({ id: asset.id, type: asset.type, mimeType: asset.mimeType });
    } else {
      setDate(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    }
  }, [mode, props]);

  useEffect(() => {
    api.getPublishingDestinations(workspaceId, channel)
      .then(setDestinations)
      .catch(() => setDestinations([]));
  }, [workspaceId, channel]);

  const selectedDestination = useMemo(
    () => destinations.find((d) => d.id === destinationId),
    [destinations, destinationId],
  );

  const compatibleDestinations = useMemo(
    () => destinations.filter((d) => d.channel === channel),
    [destinations, channel],
  );

  async function onMediaSelected(file: File) {
    setError('');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = String(reader.result ?? '');
        const uploaded = await api.uploadMediaAsset({
          workspaceId,
          campaignId,
          contentKey,
          creativeArtifactId,
          creativeVersion,
          fileBase64: base64,
          mimeType: file.type,
          filename: file.name,
        });
        setPinnedMedia(uploaded.asset);
        setMediaPreview(base64.startsWith('data:') ? base64 : `data:${file.type};base64,${base64.split(',').pop()}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload media');
      }
    };
    reader.readAsDataURL(file);
  }

  async function saveSchedule() {
    setSaving(true);
    setError('');
    try {
      // Use wallClockToISO so the entered wall-clock time is correctly converted to UTC
      // using the selected timezone, not the browser's local timezone.
      const [hh, mm] = time.split(':').map(Number);
      const scheduledFor = wallClockToISO(date, hh, mm, timezone);
      if (publicationMode === 'DIRECT' && !destinationId) {
        throw new Error('Select a destination for direct publishing.');
      }
      if (publicationMode === 'DIRECT' && !pinnedMedia) {
        throw new Error('Attach the image that will publish with this schedule.');
      }
      await api.createSchedule(campaignId, workspaceId, {
        contentKey,
        scheduledFor,
        timezone,
        publicationMode,
        destinationId: publicationMode === 'DIRECT' && destinationId ? destinationId : undefined,
        mediaAssets: pinnedMedia ? [pinnedMedia] : undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule');
    } finally {
      setSaving(false);
    }
  }

  async function cancelItem() {
    if (mode !== 'view') return;
    setSaving(true);
    try {
      await api.cancelSchedule(campaignId, props.item.id, workspaceId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setSaving(false);
    }
  }

  async function resolveAsPublished() {
    if (mode !== 'view') return;
    setSaving(true);
    try {
      await api.markSchedulePublished(campaignId, props.item.id, workspaceId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve as published');
    } finally {
      setSaving(false);
    }
  }

  async function retryPublish() {
    if (mode !== 'view') return;
    setSaving(true);
    try {
      await api.retrySchedule(campaignId, props.item.id, workspaceId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry');
    } finally {
      setSaving(false);
    }
  }

  async function confirmReschedule() {
    if (mode !== 'view') return;
    setSaving(true);
    setError('');
    try {
      const tz = props.item.timezone;
      const [hh, mm] = rescheduleTime.split(':').map(Number);
      // Convert wall-clock time in the item's timezone to UTC
      const scheduledFor = wallClockToISO(rescheduleDate, hh, mm, tz);
      await api.rescheduleItem(campaignId, props.item.id, workspaceId, scheduledFor, tz);
      setRescheduling(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reschedule');
    } finally {
      setSaving(false);
    }
  }

  const item = mode === 'view' ? props.item : null;
  const unknownOutcome = item ? isUnknownOutcome(item) : false;
  const canReschedule = item && item.status !== 'PUBLISHED' && item.status !== 'CANCELLED' && item.status !== 'PUBLISHING';
  const canCancel = item && item.status !== 'PUBLISHED' && item.status !== 'CANCELLED';

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-[720px] flex-col border-l border-[#E4E4E7] bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[#09090B]">{mode === 'create' ? 'Schedule Content' : 'Schedule Item'}</h2>
              {mode === 'view' && onNavigateToCampaign && (
                <button
                  type="button"
                  onClick={() => onNavigateToCampaign(campaignId)}
                  className="flex items-center gap-0.5 text-xs text-[#71717A] hover:text-[#09090B]"
                >
                  <ExternalLink className="h-3 w-3" />
                  Campaign
                </button>
              )}
            </div>
            <p className="text-xs text-[#71717A]">{campaignName} · {contentKey}</p>
            <p className="text-xs text-[#71717A]">{channel} · V{creativeVersion}</p>
            {item && (
              <p className={`text-xs font-medium ${unknownOutcome ? 'text-orange-600' : item.status === 'FAILED' ? 'text-red-600' : item.status === 'BLOCKED' ? 'text-amber-600' : item.status === 'PUBLISHED' ? 'text-green-700' : 'text-[#71717A]'}`}>
                {unknownOutcome ? 'Reconciliation required' : item.status.replaceAll('_', ' ').toLowerCase()}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="ml-3 rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</div>}

          {mode === 'create' ? (
            <>
              <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-[#E4E4E7] px-3 py-2" /></Field>
              <Field label="Time"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full rounded-lg border border-[#E4E4E7] px-3 py-2" /></Field>
              <Field label="Timezone"><input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="mt-1 w-full rounded-lg border border-[#E4E4E7] px-3 py-2" /></Field>
              <Field label="Mode">
                <select value={publicationMode} onChange={(e) => setPublicationMode(e.target.value as PublicationMode)} className="mt-1 w-full rounded-lg border border-[#E4E4E7] px-3 py-2">
                  <option value="MANUAL">Manual</option>
                  <option value="EXPORT">Export</option>
                  <option value="DIRECT">Direct Publish</option>
                </select>
              </Field>

              <Field label="Media">
                <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#E4E4E7] px-3 py-3 hover:bg-[#FAFAFA]">
                  <Image className="h-4 w-4 text-[#71717A]" />
                  <span className="text-sm text-[#71717A]">{pinnedMedia ? `Pinned · ${pinnedMedia.id}` : 'Attach image for this creative version'}</span>
                  <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onMediaSelected(f); }} />
                </label>
              </Field>

              {publicationMode === 'DIRECT' && (
                <Field label="Destination">
                  <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)} className="mt-1 w-full rounded-lg border border-[#E4E4E7] px-3 py-2">
                    <option value="">Select destination</option>
                    {compatibleDestinations.map((d) => (
                      <option key={d.id} value={d.id} disabled={d.selectable === false}>
                        {d.displayName}{d.unavailableReason ? ` — ${d.unavailableReason}` : ''}
                      </option>
                    ))}
                  </select>
                  {compatibleDestinations.length === 0 && (
                    <p className="mt-1 text-xs text-[#71717A]">No {channel.toLowerCase()} destinations connected. Use manual or export mode.</p>
                  )}
                </Field>
              )}

              <section className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]">Publish preview</p>
                <p className="mt-2 text-sm text-[#09090B]">{selectedDestination?.displayName ?? (publicationMode === 'DIRECT' ? 'No destination selected' : publicationMode.toLowerCase())}</p>
                <p className="text-xs text-[#71717A]">Creative V{creativeVersion} · {channel} · {publicationMode}</p>
                {mediaPreview && <img src={mediaPreview} alt="Scheduled media preview" className="mt-3 max-h-40 rounded-md border border-[#E4E4E7]" />}
                {!pinnedMedia && publicationMode === 'DIRECT' && (
                  <p className="mt-2 text-xs text-amber-700">Direct publish requires a pinned media asset.</p>
                )}
                {selectedDestination?.unavailableReason && (
                  <p className="mt-2 text-xs text-amber-700">{selectedDestination.unavailableReason}</p>
                )}
              </section>
            </>
          ) : item && (
            <>
              {/* Unknown outcome alert */}
              {unknownOutcome && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                  <p className="text-sm font-medium text-orange-800">Publish outcome unknown — reconciliation required</p>
                  <p className="mt-1 text-xs text-orange-700">
                    The publish attempt did not return a clear success or failure. Check the platform directly before acting.
                    If the post went live, use <strong>Resolve as Published</strong> below. Do not retry blindly — a duplicate post may result.
                  </p>
                </div>
              )}

              {/* Newer revision warning */}
              {item.newerRevisionAvailable && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                  <p className="text-xs text-blue-700">
                    This schedule is pinned to V{item.sourceCreativeVersion}. A newer unapproved revision exists.
                    Editing the current working version will not affect this scheduled publication.
                    {onNavigateToCampaign && (
                      <> <button type="button" onClick={() => onNavigateToCampaign(campaignId)} className="underline underline-offset-2">Open campaign</button> to review or approve the new revision first.</>
                    )}
                  </p>
                </div>
              )}

              {/* Core item fields — display in item's stored timezone, not browser local */}
              <Field label="Scheduled">
                {formatDateTimeInTz(item.scheduledFor, item.timezone)}
                <span className="ml-1 text-[#A1A1AA]">({item.timezone})</span>
              </Field>
              <Field label="Mode">{item.publicationMode}</Field>

              {/* Exact pinned creative version — never "latest" */}
              <Field label="Scheduled creative">
                <span className="font-mono text-xs">V{item.sourceCreativeVersion} · {item.sourceCreativeArtifactId}</span>
              </Field>

              {/* Exact pinned media identity */}
              {item.mediaAssets[0] && (
                <Field label="Pinned media">
                  <span className="font-mono text-xs">{item.mediaAssets[0].id}</span>
                  {item.mediaAssets[0].type && <span className="ml-2 text-[#A1A1AA]">({item.mediaAssets[0].type})</span>}
                </Field>
              )}

              {item.blockReason && !unknownOutcome && (
                <Field label="Blocked">
                  <span className="text-amber-700">{item.blockReason}</span>
                </Field>
              )}

              {item.publishedAt && (
                <Field label="Published">
                  {formatDateTimeInTz(item.publishedAt, item.timezone)}
                </Field>
              )}
              {item.externalUrl && (
                <Field label="URL">
                  <a href={item.externalUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 underline underline-offset-2">
                    {item.externalUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Field>
              )}

              {/* Content / Creative Studio links */}
              {onNavigateToCampaign && (
                <div className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]">Open in Campaigns</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigateToCampaign(campaignId)}
                      className="flex items-center gap-1 rounded border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs text-[#09090B] hover:bg-[#F4F4F5]"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Content
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateToCampaign(campaignId)}
                      className="flex items-center gap-1 rounded border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs text-[#09090B] hover:bg-[#F4F4F5]"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Creative
                    </button>
                  </div>
                  {item.newerRevisionAvailable && (
                    <p className="mt-2 text-[11px] text-amber-700">
                      Scheduled V{item.sourceCreativeVersion} differs from the current working version.
                      The schedule will publish exactly V{item.sourceCreativeVersion} unless you explicitly update it.
                    </p>
                  )}
                </div>
              )}

              {/* Inline reschedule form */}
              {rescheduling && (
                <div className="space-y-3 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]">
                    Reschedule to ({item.timezone})
                  </p>
                  <div className="flex gap-2">
                    <input type="date" value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)}
                      className="flex-1 rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm" />
                    <input type="time" value={rescheduleTime} onChange={e => setRescheduleTime(e.target.value)}
                      className="w-28 rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm" />
                  </div>
                  <p className="text-[11px] text-[#A1A1AA]">
                    Time entered in {item.timezone}. Creative V{item.sourceCreativeVersion} and pinned media remain unchanged.
                  </p>
                  <div className="flex gap-2">
                    <button type="button" disabled={saving} onClick={() => void confirmReschedule()}
                      className="rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                      {saving ? 'Moving…' : 'Confirm'}
                    </button>
                    <button type="button" onClick={() => setRescheduling(false)}
                      className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm text-[#71717A]">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-[#E4E4E7] px-5 py-4">
          {mode === 'create' ? (
            <button type="button" disabled={saving} onClick={() => void saveSchedule()}
              className="rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#18181B] disabled:opacity-50">
              {saving ? 'Scheduling…' : 'Schedule'}
            </button>
          ) : item && !rescheduling && (
            <div className="flex flex-wrap gap-2">
              {/* Unknown outcome: Resolve as Published — no blind Retry */}
              {unknownOutcome && (
                <>
                  <button type="button" disabled={saving} onClick={() => void resolveAsPublished()}
                    className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                    {saving ? 'Resolving…' : 'Resolve as Published'}
                  </button>
                  <p className="flex-1 self-center text-right text-xs text-[#A1A1AA]">
                    Only use this after confirming the post is live on the platform.
                  </p>
                </>
              )}
              {/* Clean FAILED: offer Retry */}
              {item.status === 'FAILED' && !unknownOutcome && (
                <button type="button" disabled={saving} onClick={() => void retryPublish()}
                  className="rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {saving ? 'Retrying…' : 'Retry'}
                </button>
              )}
              {/* Manual/export not yet published: mark published */}
              {(item.publicationMode === 'MANUAL' || item.publicationMode === 'EXPORT') &&
                item.status !== 'PUBLISHED' && !unknownOutcome && (
                  <button type="button" disabled={saving} onClick={() => void resolveAsPublished()}
                    className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm disabled:opacity-50">
                    Mark Published
                  </button>
              )}
              {/* Reschedule (not for published/cancelled/unknown) */}
              {canReschedule && !unknownOutcome && (
                <button type="button" onClick={() => setRescheduling(true)}
                  className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm text-[#71717A]">
                  Reschedule
                </button>
              )}
              {/* Cancel */}
              {canCancel && (
                <button type="button" disabled={saving} onClick={() => void cancelItem()}
                  className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm text-[#71717A] disabled:opacity-50">
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">
      {label}
      <div className="mt-0.5 text-sm normal-case text-[#09090B]">{children}</div>
    </label>
  );
}
