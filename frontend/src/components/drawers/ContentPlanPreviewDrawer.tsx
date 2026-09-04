import { Monitor, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ChannelPreview } from '../../features/studio/ChannelPreview';
import type {
  ChannelCapability,
  ContentDeliverable,
  ContentPlan,
  PreviewDescriptor,
  PreviewDevice,
} from '../../types';

interface Props {
  plan: ContentPlan;
  capabilities: ChannelCapability[];
  initialDeliverableId?: string;
  onClose: () => void;
}

function previewFormat(contentType: string): string {
  switch (contentType) {
    case 'CAROUSEL': return 'carousel';
    case 'STORY': return 'story';
    case 'SHORT_VIDEO': return 'short-video';
    case 'LONG_VIDEO': return 'video';
    case 'NEWSLETTER':
    case 'EMAIL': return 'newsletter';
    case 'ARTICLE': return 'article';
    case 'LANDING_PAGE': return 'landing';
    default: return 'feed';
  }
}

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[#A1A1AA]">{label}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-[#3F3F46]">{value}</p>
    </div>
  );
}

export function ContentPlanPreviewDrawer({ plan, capabilities, initialDeliverableId, onClose }: Props) {
  const [deliverableId, setDeliverableId] = useState(initialDeliverableId ?? plan.deliverables[0]?.id ?? '');

  const deliverable = plan.deliverables.find((d) => d.id === deliverableId) ?? plan.deliverables[0];
  const capability = capabilities.find((c) => c.channel === deliverable?.channel);

  const [device, setDevice] = useState<PreviewDevice>(deliverable?.deviceTargets?.[0] ?? 'mobile');

  const validDevices = useMemo(() => {
    if (!capability) return ['mobile'] as PreviewDevice[];
    if (deliverable?.contentType === 'STORY') {
      return capability.supportedDevices.filter((d) => d !== 'desktop');
    }
    return capability.supportedDevices;
  }, [capability, deliverable?.contentType]);

  const activeDevice = validDevices.includes(device) ? device : validDevices[0];

  if (!deliverable) return null;

  const descriptor: PreviewDescriptor = {
    channel: deliverable.channel.toLowerCase() as PreviewDescriptor['channel'],
    format: previewFormat(deliverable.contentType),
    device: activeDevice,
  };

  const planned = {
    title: deliverable.title,
    purpose: deliverable.purpose,
    hookDirection: deliverable.hookDirection,
    primaryMessage: deliverable.primaryMessage,
    mediaRequirement: deliverable.assetRequirements[0]?.description,
    ctaRole: deliverable.ctaRole,
  };

  return (
    <>
      <button type="button" aria-label="Close preview" className="fixed inset-0 z-40 bg-black/10" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-[640px] flex-col border-l border-[#E4E4E7] bg-[#FAFAFA] shadow-xl">

        {/* Compact single-row header */}
        <header className="flex shrink-0 items-center gap-2.5 border-b border-[#E4E4E7] bg-white px-4 py-2.5">
          <p className="shrink-0 text-sm font-semibold text-[#09090B]">Content Plan Preview</p>
          <select
            value={deliverable.id}
            onChange={(e) => setDeliverableId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs text-[#09090B]"
          >
            {plan.deliverables.map((d) => (
              <option key={d.id} value={d.id}>{d.title}</option>
            ))}
          </select>
          {validDevices.length > 1 && (
            <div className="flex shrink-0 gap-1">
              {validDevices.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs capitalize ${
                    activeDevice === d ? 'bg-[#09090B] text-white' : 'border border-[#E4E4E7] text-[#71717A]'
                  }`}
                >
                  {d === 'desktop' && <Monitor className="h-3 w-3" />}
                  {d}
                </button>
              ))}
            </div>
          )}
          <button type="button" aria-label="Close" onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]">
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: post/campaign details */}
          <div className="w-[210px] shrink-0 space-y-4 overflow-y-auto border-r border-[#E4E4E7] bg-white p-4">
            <MetaRow label="Channel" value={deliverable.channel} />
            <MetaRow
              label="Format"
              value={`${deliverable.contentType.replaceAll('_', ' ')} · ${deliverable.format.replaceAll('_', ' ')}`}
            />
            <MetaRow label="Purpose" value={deliverable.purpose} />
            <MetaRow label="Hook" value={deliverable.hookDirection} />
            <MetaRow label="Message" value={deliverable.primaryMessage} />
            <MetaRow label="Media" value={deliverable.assetRequirements[0]?.description} />
            <MetaRow label="CTA" value={deliverable.ctaRole} />
          </div>

          {/* Right: platform preview */}
          <div className="flex-1 overflow-y-auto bg-zinc-50 p-5">
            <ChannelPreview descriptor={descriptor} planned={planned} />
          </div>
        </div>
      </aside>
    </>
  );
}

export function DeliverablePreviewButton({
  onClick,
}: {
  deliverable: ContentDeliverable;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title="Preview"
      aria-label="Preview"
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-lg border border-[#E4E4E7] p-1.5 text-[#71717A] hover:bg-[#FAFAFA] hover:text-[#09090B]"
    >
      <Monitor className="h-3.5 w-3.5" />
    </button>
  );
}
