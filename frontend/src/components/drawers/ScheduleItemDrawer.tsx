import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { PublicationMode, PublishingDestination, ScheduledContentItem } from '../../types';

interface BaseProps {
  campaignId: string;
  workspaceId: string;
  campaignName: string;
  onClose: () => void;
  onSaved: () => void;
}

interface CreateProps extends BaseProps {
  mode: 'create';
  contentKey: string;
  item?: never;
}

interface ViewProps extends BaseProps {
  mode: 'view';
  item: ScheduledContentItem;
  contentKey?: never;
}

type Props = CreateProps | ViewProps;

export function ScheduleItemDrawer(props: Props) {
  const { campaignId, workspaceId, campaignName, onClose, onSaved, mode } = props;
  const contentKey = mode === 'create' ? props.contentKey : props.item.contentKey;
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [publicationMode, setPublicationMode] = useState<PublicationMode>('MANUAL');
  const [destinationId, setDestinationId] = useState('');
  const [destinations, setDestinations] = useState<PublishingDestination[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode === 'view' && props.item) {
      const d = new Date(props.item.scheduledFor);
      setDate(d.toISOString().slice(0, 10));
      setTime(d.toISOString().slice(11, 16));
      setTimezone(props.item.timezone);
      setPublicationMode(props.item.publicationMode);
      setDestinationId(props.item.destinationId ?? '');
    } else {
      setDate(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    }
  }, [mode, props]);

  useEffect(() => {
    api.getPublishingDestinations(workspaceId)
      .then(setDestinations)
      .catch(() => setDestinations([]));
  }, [workspaceId]);

  async function saveSchedule() {
    setSaving(true);
    setError('');
    try {
      const scheduledFor = new Date(`${date}T${time}:00`).toISOString();
      await api.createSchedule(campaignId, workspaceId, {
        contentKey,
        scheduledFor,
        timezone,
        publicationMode,
        destinationId: publicationMode === 'DIRECT' && destinationId ? destinationId : undefined,
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

  async function markPublished() {
    if (mode !== 'view') return;
    setSaving(true);
    try {
      await api.markSchedulePublished(campaignId, props.item.id, workspaceId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark published');
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

  const item = mode === 'view' ? props.item : null;

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-[720px] flex-col border-l border-[#E4E4E7] bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[#09090B]">{mode === 'create' ? 'Schedule Content' : 'Schedule Item'}</h2>
            <p className="text-xs text-[#71717A]">{campaignName} · {contentKey}</p>
            {item && <p className="text-xs text-[#71717A]">Approved V{item.sourceCreativeVersion} · {item.status.replaceAll('_', ' ').toLowerCase()}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]"><X className="h-4 w-4" /></button>
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
              {publicationMode === 'DIRECT' && (
                <Field label="Destination">
                  <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)} className="mt-1 w-full rounded-lg border border-[#E4E4E7] px-3 py-2">
                    <option value="">Select destination</option>
                    {destinations.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
                  </select>
                  {destinations.length === 0 && (
                    <p className="mt-1 text-xs text-[#71717A]">No direct publishing destinations connected. Use manual or export mode.</p>
                  )}
                </Field>
              )}
            </>
          ) : item && (
            <>
              <Field label="Scheduled">{new Date(item.scheduledFor).toLocaleString()} ({item.timezone})</Field>
              <Field label="Mode">{item.publicationMode}</Field>
              {item.blockReason && <Field label="Blocked">{item.blockReason}</Field>}
              {item.publishedAt && <Field label="Published">{new Date(item.publishedAt).toLocaleString()}</Field>}
              {item.externalUrl && <Field label="URL">{item.externalUrl}</Field>}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-[#E4E4E7] px-5 py-4">
          {mode === 'create' ? (
            <button type="button" disabled={saving} onClick={() => void saveSchedule()} className="rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#18181B] disabled:opacity-50">
              {saving ? 'Scheduling…' : 'Schedule'}
            </button>
          ) : item && (
            <div className="flex flex-wrap gap-2">
              {item.status === 'FAILED' && (
                <button type="button" disabled={saving} onClick={() => void retryPublish()} className="rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white">Retry</button>
              )}
              {(item.publicationMode === 'MANUAL' || item.publicationMode === 'EXPORT') && item.status !== 'PUBLISHED' && (
                <button type="button" disabled={saving} onClick={() => void markPublished()} className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm">Mark Published</button>
              )}
              {item.status !== 'PUBLISHED' && item.status !== 'CANCELLED' && (
                <button type="button" disabled={saving} onClick={() => void cancelItem()} className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm text-[#71717A]">Cancel</button>
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
      <div className="text-sm normal-case text-[#09090B]">{children}</div>
    </label>
  );
}
