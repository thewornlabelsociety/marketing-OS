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

export function ContentPlanPreviewDrawer({ plan, capabilities, initialDeliverableId, onClose }: Props) {
  const [deliverableId, setDeliverableId] = useState(initialDeliverableId ?? plan.deliverables[0]?.id ?? '');

  const deliverable = plan.deliverables.find((d) => d.id === deliverableId) ?? plan.deliverables[0];
  const capability = capabilities.find((c) => c.channel === deliverable?.channel);

  const devices = capability?.supportedDevices ?? ['mobile'];
  const [device, setDevice] = useState<PreviewDevice>(deliverable?.deviceTargets?.[0] ?? devices[0] ?? 'mobile');

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

  return (
    <>
      <button type="button" aria-label="Close preview" className="fixed inset-0 z-40 bg-black/10" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-[640px] flex-col border-l border-[#E4E4E7] bg-[#FAFAFA] shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] bg-white px-5 py-4">
          <p className="text-sm font-semibold text-[#09090B]">Content Plan Preview</p>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 border-b border-[#E4E4E7] bg-white px-5 py-4">
          <label className="block text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">
            Content
            <select
              value={deliverable.id}
              onChange={(e) => setDeliverableId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B]"
            >
              {plan.deliverables.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">
              Channel
              <div className="mt-1 rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B]">
                {deliverable.channel}
              </div>
            </label>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">
              Format / View
              <div className="mt-1 rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B]">
                {deliverable.contentType.replaceAll('_', ' ')} · {deliverable.format.replaceAll('_', ' ')}
              </div>
            </label>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">Device</p>
            <div className="mt-1 flex gap-2">
              {validDevices.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
                    activeDevice === d ? 'bg-[#09090B] text-white' : 'border border-[#E4E4E7] text-[#71717A]'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <ChannelPreview
            descriptor={descriptor}
            planned={{
              title: deliverable.title,
              purpose: deliverable.purpose,
              hookDirection: deliverable.hookDirection,
              primaryMessage: deliverable.primaryMessage,
              mediaRequirement: deliverable.assetRequirements[0]?.description,
              ctaRole: deliverable.ctaRole,
            }}
          />
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
