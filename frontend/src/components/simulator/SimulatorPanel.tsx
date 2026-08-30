import { InstagramFeedPreview } from './InstagramFeedPreview';
import { IPhoneFrame } from './IPhoneFrame';
import { MobileEmailPreview } from './MobileEmailPreview';

export function SimulatorPanel() {
  return (
    <aside className="flex w-[580px] shrink-0 flex-col border-l border-[#E4E4E7] bg-[#FAFAFA]">
      <div className="border-b border-[#E4E4E7] bg-white px-5 py-4">
        <h2 className="text-sm font-semibold text-[#09090B]">Live Simulator</h2>
        <p className="mt-1 text-xs text-[#71717A]">
          Instagram Feed and Mobile Email previews update in real time.
        </p>
      </div>
      <div className="flex flex-1 flex-wrap items-start justify-center gap-6 overflow-y-auto p-6">
        <IPhoneFrame title="Instagram Feed">
          <InstagramFeedPreview />
        </IPhoneFrame>
        <IPhoneFrame title="Mobile Email">
          <MobileEmailPreview />
        </IPhoneFrame>
      </div>
    </aside>
  );
}
