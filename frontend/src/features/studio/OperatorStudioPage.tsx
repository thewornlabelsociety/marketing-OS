import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  ImageOff,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { ScheduleItemDrawer } from '../../components/drawers/ScheduleItemDrawer';
import { api } from '../../services/api';

// ─── Types ───────────────────────────────────────────────────────────────────

type StudioFormat = 'POST' | 'CAROUSEL' | 'STORY' | 'EMAIL';

interface StudioProduct {
  id: string;
  title: string;
  brand: string | null;
  price: number | null;
  currency: string | null;
  imageUrls: string[];
  availability: string;
  marketingBucket: 'NEW' | 'CURRENT' | 'SALE' | null;
  size: string | null;
  category: string | null;
  publicUrl: string | null;
}

interface CarouselContent {
  kind: 'CAROUSEL';
  caption: string;
  slides: { slideNumber: number; headline: string; body: string }[];
  cta: string;
}
interface PostContent {
  kind: 'STATIC_POST';
  caption: string;
  hook: string;
  cta: string;
}
interface StoryContent {
  kind: 'STORY';
  frames: { frameNumber: number; headline: string; body?: string; cta?: string }[];
}
interface EmailContent {
  kind: 'EMAIL';
  subject: string;
  preheader: string;
  headline: string;
  body: string;
  cta: { label: string; destinationDescription: string };
}
type ArtifactContent = CarouselContent | PostContent | StoryContent | EmailContent;

interface Artifact {
  id: string;
  workspaceId: string;
  campaignId: string;
  contentKey: string;
  deliverableId: string;
  version: number;
  channel: string;
  contentType: string;
  format: string;
  status: string;
  content: ArtifactContent;
}

interface Session {
  campaignId: string;
  campaignName: string;
  contentKey: string;
  artifact: Artifact;
  products: StudioProduct[];
  aiGenerated: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<StudioFormat, string> = {
  POST: 'Instagram Post',
  CAROUSEL: 'Carousel',
  STORY: 'Stories',
  EMAIL: 'Email',
};

const FORMAT_RATIO: Record<StudioFormat, string> = {
  POST: 'aspect-[4/5]',
  CAROUSEL: 'aspect-[4/5]',
  STORY: 'aspect-[9/16]',
  EMAIL: 'aspect-auto',
};

function formatPrice(price: number | null, currency: string | null) {
  if (price == null) return '';
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: currency ?? 'NZD',
    maximumFractionDigits: 0,
  }).format(price);
}

function channelFor(format: StudioFormat) {
  return format === 'EMAIL' ? 'EMAIL' : 'INSTAGRAM';
}

// ─── Format Picker ────────────────────────────────────────────────────────────

const FORMAT_DESCRIPTIONS: Record<StudioFormat, string> = {
  POST: 'Single image, 4:5 ratio — best for hero products',
  CAROUSEL: 'Swipeable slides, one product per slide',
  STORY: '9:16 vertical format with frames',
  EMAIL: 'Email newsletter layout with subject and body',
};

function FormatPicker({
  products,
  onSelect,
}: {
  products: StudioProduct[];
  onSelect: (format: StudioFormat) => void;
}) {
  const formats: StudioFormat[] = ['POST', 'CAROUSEL', 'STORY', 'EMAIL'];
  const count = products.length;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <p className="mos-eyebrow mb-1">New from Worn Label</p>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
        {count === 1 ? products[0].title : `${count} products selected`}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        {count === 1 ? '1 product' : `${count} products`} · Choose a format to continue
      </p>

      {/* Selected product strip */}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
        {products.map((p) => (
          <div key={p.id} className="relative flex-shrink-0">
            <div className="h-16 w-16 overflow-hidden rounded-xl bg-zinc-100">
              {p.imageUrls[0] ? (
                <img src={p.imageUrls[0]} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center">
                  <ImageOff className="h-5 w-5 text-zinc-400" />
                </span>
              )}
            </div>
            {p.marketingBucket === 'NEW' && (
              <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                NEW
              </span>
            )}
            {p.marketingBucket === 'SALE' && (
              <span className="absolute -right-1 -top-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                SALE
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Format cards */}
      <div className="mt-8 grid grid-cols-2 gap-3">
        {formats.map((fmt) => (
          <button
            key={fmt}
            onClick={() => onSelect(fmt)}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 text-left transition hover:border-zinc-950 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-zinc-950"
          >
            <p className="text-sm font-semibold text-zinc-950">{FORMAT_LABELS[fmt]}</p>
            <p className="mt-1 text-xs text-zinc-500">{FORMAT_DESCRIPTIONS[fmt]}</p>
          </button>
        ))}
        <button
          disabled
          className="col-span-2 cursor-not-allowed rounded-2xl border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-400"
        >
          Make whole set — coming soon
        </button>
      </div>
    </div>
  );
}

// ─── Preview Frames ───────────────────────────────────────────────────────────

function CarouselPreview({
  content,
  products,
  activeSlide,
}: {
  content: CarouselContent;
  products: StudioProduct[];
  activeSlide: number;
}) {
  const slide = content.slides[activeSlide];
  const product = products[activeSlide] ?? products[0];
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-2xl bg-zinc-100">
        {product?.imageUrls[0] ? (
          <img
            src={product.imageUrls[0]}
            alt=""
            className="aspect-[4/5] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[4/5] w-full items-center justify-center">
            <ImageOff className="h-10 w-10 text-zinc-300" />
          </div>
        )}
      </div>
      {slide && (
        <div className="rounded-xl bg-zinc-50 p-3">
          <p className="text-xs font-bold text-zinc-800">{slide.headline}</p>
          <p className="mt-0.5 text-xs text-zinc-600">{slide.body}</p>
        </div>
      )}
      {/* Slide dots */}
      <div className="flex justify-center gap-1.5">
        {content.slides.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === activeSlide ? 'w-5 bg-zinc-950' : 'w-1.5 bg-zinc-300'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function PostPreview({ content, products }: { content: PostContent; products: StudioProduct[] }) {
  const product = products[0];
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-2xl bg-zinc-100">
        {product?.imageUrls[0] ? (
          <img src={product.imageUrls[0]} alt="" className="aspect-[4/5] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/5] w-full items-center justify-center">
            <ImageOff className="h-10 w-10 text-zinc-300" />
          </div>
        )}
      </div>
      <div className="rounded-xl bg-zinc-50 p-3">
        <p className="text-xs font-bold text-zinc-800">{content.hook}</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 line-clamp-4">{content.caption}</p>
      </div>
    </div>
  );
}

function StoryPreview({ content, products }: { content: StoryContent; products: StudioProduct[] }) {
  const [activeFrame, setActiveFrame] = useState(0);
  const frame = content.frames[activeFrame];
  const product = products[activeFrame] ?? products[0];
  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-2xl bg-zinc-900">
        {product?.imageUrls[0] ? (
          <img src={product.imageUrls[0]} alt="" className="aspect-[9/16] w-full object-cover opacity-80" />
        ) : (
          <div className="aspect-[9/16] w-full" />
        )}
        {frame && (
          <div className="absolute inset-x-4 bottom-6 text-white">
            <p className="text-xl font-bold leading-tight drop-shadow">{frame.headline}</p>
            {frame.body && <p className="mt-1 text-sm drop-shadow">{frame.body}</p>}
            {frame.cta && (
              <p className="mt-3 inline-block rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-zinc-950">
                {frame.cta}
              </p>
            )}
          </div>
        )}
        {/* Frame progress bars */}
        <div className="absolute inset-x-3 top-3 flex gap-1">
          {content.frames.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveFrame(i)}
              className={`h-0.5 flex-1 rounded-full ${i === activeFrame ? 'bg-white' : 'bg-white/40'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmailPreview({ content }: { content: EmailContent }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white text-sm">
      <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
        <p className="text-xs text-zinc-500">Subject</p>
        <p className="mt-0.5 font-medium text-zinc-900">{content.subject}</p>
        <p className="mt-0.5 text-xs text-zinc-400">{content.preheader}</p>
      </div>
      <div className="px-6 py-6">
        <h2 className="text-xl font-bold text-zinc-950">{content.headline}</h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-700">
          {content.body.split('\n').filter(Boolean).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        <div className="mt-6">
          <span className="inline-block rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white">
            {content.cta.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Copy Editor Panel ─────────────────────────────────────────────────────────

type QuickAction = 'brand-voice' | 'shorter' | 'editorial' | 'playful';

const QUICK_ACTIONS: { id: QuickAction; label: string }[] = [
  { id: 'brand-voice', label: 'More Worn Label' },
  { id: 'shorter', label: 'Shorter' },
  { id: 'editorial', label: 'More editorial' },
  { id: 'playful', label: 'More playful' },
];

const REVISION_PROMPTS: Record<QuickAction, string> = {
  'brand-voice': 'Rewrite using a stronger Worn Label brand voice — more editorial, considered, and sustainability-conscious.',
  'shorter': 'Shorten the copy by about 30%. Keep the most impactful lines.',
  'editorial': 'Make the copy more editorial — read like a fashion magazine, not an ad.',
  'playful': 'Make the copy more playful and human. Less formal, more personality.',
};

function CopyEditor({
  content,
  format,
  session,
  onContentChange,
  onRevising,
}: {
  content: ArtifactContent;
  format: StudioFormat;
  session: Session;
  onContentChange: (c: ArtifactContent) => void;
  onRevising: (v: boolean) => void;
}) {
  const { activeEntity } = useApp();
  const [revisingAction, setRevisingAction] = useState<QuickAction | null>(null);

  const requestRevision = useCallback(
    async (action: QuickAction) => {
      if (!activeEntity) return;
      setRevisingAction(action);
      onRevising(true);
      try {
        await api.establishLocalOperatorSession();
        const result = await api.requestCreativeRevision(
          session.campaignId,
          session.artifact.contentKey,
          activeEntity.id,
          REVISION_PROMPTS[action],
        );
        const newContent = (result as { content?: ArtifactContent }).content;
        if (newContent) onContentChange(newContent);
      } catch {
        // silent — user sees unchanged copy
      } finally {
        setRevisingAction(null);
        onRevising(false);
      }
    },
    [activeEntity, session, onContentChange, onRevising],
  );

  const isCarousel = format === 'CAROUSEL' && content.kind === 'CAROUSEL';
  const isPost = format === 'POST' && content.kind === 'STATIC_POST';
  const isEmail = format === 'EMAIL' && content.kind === 'EMAIL';
  const isStory = format === 'STORY' && content.kind === 'STORY';

  return (
    <div className="space-y-5">
      {/* Quick AI actions */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">AI quick actions</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => void requestRevision(action.id)}
              disabled={revisingAction !== null}
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-40"
            >
              {revisingAction === action.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 text-zinc-400" />
              )}
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Copy fields */}
      {isPost && (
        <div className="space-y-3">
          <Field label="Hook (first line)">
            <textarea
              rows={2}
              value={(content as PostContent).hook}
              onChange={(e) => onContentChange({ ...(content as PostContent), hook: e.target.value })}
              className="mos-field w-full resize-none"
            />
          </Field>
          <Field label="Caption">
            <textarea
              rows={5}
              value={(content as PostContent).caption}
              onChange={(e) => onContentChange({ ...(content as PostContent), caption: e.target.value })}
              className="mos-field w-full resize-none"
            />
          </Field>
        </div>
      )}

      {isCarousel && (
        <div className="space-y-3">
          <Field label="Opening caption">
            <textarea
              rows={4}
              value={(content as CarouselContent).caption}
              onChange={(e) => onContentChange({ ...(content as CarouselContent), caption: e.target.value })}
              className="mos-field w-full resize-none"
            />
          </Field>
          {(content as CarouselContent).slides.map((slide, i) => (
            <details key={i} className="group rounded-xl border border-zinc-200">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-xs font-semibold text-zinc-700 marker:hidden">
                <span>Slide {i + 1} · {slide.headline.slice(0, 40)}</span>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400 transition group-open:rotate-180" />
              </summary>
              <div className="space-y-2 px-4 pb-4">
                <Field label="Headline">
                  <input
                    type="text"
                    value={slide.headline}
                    onChange={(e) => {
                      const slides = [...(content as CarouselContent).slides];
                      slides[i] = { ...slide, headline: e.target.value };
                      onContentChange({ ...(content as CarouselContent), slides });
                    }}
                    className="mos-field w-full"
                  />
                </Field>
                <Field label="Body">
                  <textarea
                    rows={2}
                    value={slide.body}
                    onChange={(e) => {
                      const slides = [...(content as CarouselContent).slides];
                      slides[i] = { ...slide, body: e.target.value };
                      onContentChange({ ...(content as CarouselContent), slides });
                    }}
                    className="mos-field w-full resize-none"
                  />
                </Field>
              </div>
            </details>
          ))}
        </div>
      )}

      {isStory && (
        <div className="space-y-3">
          {(content as StoryContent).frames.map((frame, i) => (
            <details key={i} className="group rounded-xl border border-zinc-200">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-xs font-semibold text-zinc-700 marker:hidden">
                <span>Frame {i + 1} · {frame.headline.slice(0, 40)}</span>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400 transition group-open:rotate-180" />
              </summary>
              <div className="space-y-2 px-4 pb-4">
                <Field label="Headline">
                  <input
                    type="text"
                    value={frame.headline}
                    onChange={(e) => {
                      const frames = [...(content as StoryContent).frames];
                      frames[i] = { ...frame, headline: e.target.value };
                      onContentChange({ ...(content as StoryContent), frames });
                    }}
                    className="mos-field w-full"
                  />
                </Field>
                <Field label="Body (optional)">
                  <input
                    type="text"
                    value={frame.body ?? ''}
                    onChange={(e) => {
                      const frames = [...(content as StoryContent).frames];
                      frames[i] = { ...frame, body: e.target.value };
                      onContentChange({ ...(content as StoryContent), frames });
                    }}
                    className="mos-field w-full"
                  />
                </Field>
              </div>
            </details>
          ))}
        </div>
      )}

      {isEmail && (
        <div className="space-y-3">
          <Field label="Subject line">
            <input
              type="text"
              value={(content as EmailContent).subject}
              onChange={(e) => onContentChange({ ...(content as EmailContent), subject: e.target.value })}
              className="mos-field w-full"
            />
          </Field>
          <Field label="Preheader">
            <input
              type="text"
              value={(content as EmailContent).preheader}
              onChange={(e) => onContentChange({ ...(content as EmailContent), preheader: e.target.value })}
              className="mos-field w-full"
            />
          </Field>
          <Field label="Headline">
            <input
              type="text"
              value={(content as EmailContent).headline}
              onChange={(e) => onContentChange({ ...(content as EmailContent), headline: e.target.value })}
              className="mos-field w-full"
            />
          </Field>
          <Field label="Body">
            <textarea
              rows={6}
              value={(content as EmailContent).body}
              onChange={(e) => onContentChange({ ...(content as EmailContent), body: e.target.value })}
              className="mos-field w-full resize-none"
            />
          </Field>
          <Field label="CTA label">
            <input
              type="text"
              value={(content as EmailContent).cta.label}
              onChange={(e) => onContentChange({ ...(content as EmailContent), cta: { ...(content as EmailContent).cta, label: e.target.value } })}
              className="mos-field w-full"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

// ─── Live Preview Panel ────────────────────────────────────────────────────────

function LivePreview({
  content,
  format,
  products,
  activeSlide,
}: {
  content: ArtifactContent;
  format: StudioFormat;
  products: StudioProduct[];
  activeSlide: number;
}) {
  return (
    <div className="sticky top-6">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Preview</p>
      <div className={format !== 'EMAIL' ? 'max-w-[320px]' : 'max-w-[500px]'}>
        {format === 'CAROUSEL' && content.kind === 'CAROUSEL' && (
          <CarouselPreview content={content} products={products} activeSlide={activeSlide} />
        )}
        {format === 'POST' && content.kind === 'STATIC_POST' && (
          <PostPreview content={content} products={products} />
        )}
        {format === 'STORY' && content.kind === 'STORY' && (
          <StoryPreview content={content} products={products} />
        )}
        {format === 'EMAIL' && content.kind === 'EMAIL' && (
          <EmailPreview content={content} />
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type PageStep = 'format' | 'setup' | 'studio' | 'error';

export default function OperatorStudioPage() {
  const { activeEntity, selectedSourceProductIds, setSelectedSourceProductIds, setActiveTab, setActiveCampaignId } = useApp();

  const [step, setStep] = useState<PageStep>('format');
  const [format, setFormat] = useState<StudioFormat | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Studio editing state
  const [content, setContent] = useState<ArtifactContent | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [revising, setRevising] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Products to display in the format picker — from context
  const products = selectedSourceProductIds;

  // Placeholder product state for format picker (we fetch from the session after setup)
  const [pickerProducts, setPickerProducts] = useState<StudioProduct[]>([]);

  // When we have product IDs but no product data, build minimal preview items
  useEffect(() => {
    if (selectedSourceProductIds.length === 0) return;
    // We build minimal cards from IDs only — the API will return full data in session
    setPickerProducts(
      selectedSourceProductIds.map((id) => ({
        id,
        title: '',
        brand: null,
        price: null,
        currency: null,
        imageUrls: [],
        availability: 'AVAILABLE',
        marketingBucket: null,
        size: null,
        category: null,
        publicUrl: null,
      })),
    );
  }, [selectedSourceProductIds]);

  const setupStudio = useCallback(
    async (selectedFormat: StudioFormat) => {
      if (!activeEntity) return;
      setFormat(selectedFormat);
      setStep('setup');
      setSetupError(null);
      try {
        await api.establishLocalOperatorSession();
        const result = await api.createStudioSession(
          activeEntity.id,
          selectedSourceProductIds,
          selectedFormat,
        );
        const s: Session = {
          campaignId: result.campaignId,
          campaignName: result.campaignName,
          contentKey: result.contentKey,
          artifact: result.artifact as unknown as Artifact,
          products: result.products as unknown as StudioProduct[],
          aiGenerated: result.aiGenerated,
        };
        setSession(s);
        setContent(s.artifact.content);
        setActiveSlide(0);
        setApproved(false);
        setStep('studio');
      } catch (err) {
        setSetupError((err as Error).message);
        setStep('error');
      }
    },
    [activeEntity, selectedSourceProductIds],
  );

  // Auto-save edits to backend
  const persistEdit = useCallback(
    async (newContent: ArtifactContent) => {
      if (!session || !activeEntity) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveState('saving');
      saveTimer.current = setTimeout(async () => {
        try {
          await api.establishLocalOperatorSession();
          await api.patchCreative(
            session.campaignId,
            session.artifact.contentKey,
            activeEntity.id,
            newContent,
          );
          if (approved) setApproved(false); // edit resets approval
          setSaveState('saved');
          setTimeout(() => setSaveState('idle'), 2000);
        } catch {
          setSaveState('idle');
        }
      }, 800);
    },
    [session, activeEntity, approved],
  );

  const handleContentChange = useCallback(
    (newContent: ArtifactContent) => {
      setContent(newContent);
      void persistEdit(newContent);
    },
    [persistEdit],
  );

  const handleApprove = useCallback(async () => {
    if (!session || !activeEntity || approving) return;
    setApproving(true);
    try {
      await api.establishLocalOperatorSession();
      await api.approveCreative(
        session.campaignId,
        session.artifact.contentKey,
        activeEntity.id,
        session.artifact.id,
      );
      setApproved(true);
    } catch {
      // show button again
    } finally {
      setApproving(false);
    }
  }, [session, activeEntity, approving]);

  const handleBack = () => {
    if (step === 'studio' || step === 'format' || step === 'error') {
      setSelectedSourceProductIds([]);
      setActiveTab('create');
    } else {
      setStep('format');
    }
  };

  if (selectedSourceProductIds.length === 0 && step === 'format') {
    return (
      <div className="flex h-full items-center justify-center p-10 text-sm text-zinc-500">
        No products selected.{' '}
        <button onClick={() => setActiveTab('create')} className="ml-1 underline hover:text-zinc-800">
          Go back
        </button>
      </div>
    );
  }

  // ─── Format Picker Step ────────────────────────────────────────────────────

  if (step === 'format') {
    return (
      <div className="relative h-full overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-100 bg-white px-4 py-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="text-xs font-semibold text-zinc-950">Operator Studio</span>
        </div>
        <FormatPicker products={pickerProducts} onSelect={(f) => void setupStudio(f)} />
      </div>
    );
  }

  // ─── Setup Step ────────────────────────────────────────────────────────────

  if (step === 'setup') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-10">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        <p className="text-sm font-medium text-zinc-600">Creating your content…</p>
        <p className="text-xs text-zinc-400">
          {format ? `${FORMAT_LABELS[format]} · ` : ''}AI is writing from your brand voice
        </p>
      </div>
    );
  }

  // ─── Error Step ────────────────────────────────────────────────────────────

  if (step === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500" />
        <p className="text-sm font-semibold text-zinc-900">Something went wrong</p>
        <p className="max-w-sm text-xs text-zinc-500">{setupError}</p>
        <button
          onClick={() => {
            if (format) void setupStudio(format);
            else setStep('format');
          }}
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
        <button onClick={handleBack} className="text-xs text-zinc-400 underline hover:text-zinc-700">
          Go back
        </button>
      </div>
    );
  }

  // ─── Studio Step ───────────────────────────────────────────────────────────

  if (!session || !content) return null;

  const sessionProducts = session.products;
  const isCarousel = format === 'CAROUSEL';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-100 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="hidden text-xs text-zinc-400 sm:inline">|</span>
          <span className="hidden truncate text-xs font-semibold text-zinc-950 sm:inline max-w-[200px]">
            {session.campaignName}
          </span>
          <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
            {format ? FORMAT_LABELS[format] : ''}
          </span>
          {!session.aiGenerated && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Template copy — AI unavailable
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {saveState === 'saving' && (
            <span className="text-[10px] text-zinc-400">Saving…</span>
          )}
          {saveState === 'saved' && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-600">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}

          {!approved ? (
            <button
              onClick={() => void handleApprove()}
              disabled={approving || revising}
              className="flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Looks good
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                <Check className="h-3.5 w-3.5" /> Ready
              </span>
              <button
                onClick={() => setScheduleOpen(true)}
                className="rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
              >
                Schedule
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Product strip */}
      <div className="flex flex-shrink-0 items-center gap-3 overflow-x-auto border-b border-zinc-100 bg-zinc-50 px-4 py-3">
        {sessionProducts.map((p, i) => (
          <button
            key={p.id}
            onClick={() => isCarousel && setActiveSlide(i)}
            className={`group flex flex-shrink-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 transition ${
              isCarousel && activeSlide === i
                ? 'border-zinc-950 bg-white shadow-sm'
                : 'border-zinc-200 bg-white hover:border-zinc-400'
            }`}
          >
            <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100">
              {p.imageUrls[0] ? (
                <img src={p.imageUrls[0]} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center">
                  <ImageOff className="h-4 w-4 text-zinc-300" />
                </span>
              )}
              {p.marketingBucket === 'NEW' && (
                <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 px-1 py-0.5 text-[8px] font-bold text-white">
                  N
                </span>
              )}
              {p.marketingBucket === 'SALE' && (
                <span className="absolute -right-1 -top-1 rounded-full bg-amber-100 px-1 py-0.5 text-[8px] font-bold text-amber-800">
                  S
                </span>
              )}
              {p.availability !== 'AVAILABLE' && (
                <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[9px] font-bold text-red-600">
                  SOLD
                </span>
              )}
            </div>
            <div className="hidden text-left sm:block">
              <p className="max-w-[120px] truncate text-[11px] font-semibold text-zinc-900">{p.title}</p>
              <p className="text-[10px] text-zinc-500">
                {p.brand ?? ''}{p.size ? ` · ${p.size}` : ''}
                {p.price != null ? ` · ${formatPrice(p.price, p.currency)}` : ''}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Two-panel workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: controls */}
        <div className="min-w-0 flex-1 overflow-y-auto border-r border-zinc-100 p-6">
          <CopyEditor
            content={content}
            format={format!}
            session={session}
            onContentChange={handleContentChange}
            onRevising={setRevising}
          />
        </div>

        {/* Right: preview */}
        <div className="hidden w-80 flex-shrink-0 overflow-y-auto p-6 lg:block xl:w-96">
          <LivePreview
            content={content}
            format={format!}
            products={sessionProducts}
            activeSlide={activeSlide}
          />
        </div>
      </div>

      {/* Schedule drawer */}
      {scheduleOpen && session && format && (
        <ScheduleItemDrawer
          mode="create"
          campaignId={session.campaignId}
          workspaceId={activeEntity?.id ?? ''}
          campaignName={session.campaignName}
          contentKey={session.artifact.contentKey}
          channel={channelFor(format) as 'INSTAGRAM' | 'EMAIL'}
          creativeArtifactId={session.artifact.id}
          creativeVersion={session.artifact.version}
          onClose={() => setScheduleOpen(false)}
          onSaved={() => {
            setScheduleOpen(false);
            setActiveCampaignId(session.campaignId);
            setActiveTab('campaign-detail');
          }}
          onNavigateToCampaign={(id) => {
            setActiveCampaignId(id);
            setActiveTab('campaign-detail');
          }}
        />
      )}
    </div>
  );
}
