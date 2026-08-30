import { X } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { BrandBrain } from '../../types';

interface Props {
  onClose: () => void;
}

const ARCHETYPES = [
  'The Hero', 'The Innocent', 'The Explorer', 'The Sage',
  'The Outlaw', 'The Magician', 'The Regular Person', 'The Lover',
  'The Jester', 'The Caregiver', 'The Ruler', 'The Creator',
];

function tagList(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export default function BrandSetupWizard({ onClose }: Props) {
  const { refreshEntities, setActiveTab } = useApp();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step 1
  const [brandName, setBrandName] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [primaryAudience, setPrimaryAudience] = useState('');
  const [customerNeeds, setCustomerNeeds] = useState('');

  // Step 2
  const [archetype, setArchetype] = useState('');
  const [traits, setTraits] = useState('');
  const [principles, setPrinciples] = useState('');

  // Step 3
  const [preferredWords, setPreferredWords] = useState('');
  const [bannedWords, setBannedWords] = useState('');
  const [ctaStyle, setCtaStyle] = useState('');
  const [palette, setPalette] = useState('');
  const [fonts, setFonts] = useState('');
  const [visualNotes, setVisualNotes] = useState('');

  const canAdvanceStep1 = brandName.trim().length > 0 && primaryAudience.trim().length > 0;
  const canFinish = step === 3;

  async function handleFinish() {
    if (!brandName.trim()) return;

    setSaving(true);
    setError('');
    try {
      const slug = brandName.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const id = `entity_${slug}_${Date.now()}`;

      const brain: BrandBrain = {
        identity: {
          name: brandName.trim(),
          description: description.trim() || undefined,
          website: website.trim() || undefined,
        },
        audience: {
          primaryAudience: primaryAudience.trim() || undefined,
          needs: customerNeeds.trim() ? tagList(customerNeeds) : undefined,
        },
        personality: {
          archetype: archetype || undefined,
          traits: traits.trim() ? tagList(traits) : undefined,
          principles: principles.trim() ? tagList(principles) : undefined,
        },
        language: {
          preferredWords: preferredWords.trim() ? tagList(preferredWords) : undefined,
          bannedWords: bannedWords.trim() ? tagList(bannedWords) : undefined,
          ctaStyle: ctaStyle.trim() || undefined,
        },
        visual: {
          palette: palette.trim() ? tagList(palette) : undefined,
          fonts: fonts.trim() ? tagList(fonts) : undefined,
          visualStyleNotes: visualNotes.trim() || undefined,
        },
      };

      await api.createEntity({
        id,
        name: brandName.trim(),
        slug,
        brand_kit: { brandBrain: brain },
      });

      await refreshEntities();
      setActiveTab('campaigns');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B] outline-none focus:border-[#A1A1AA]';
  const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#71717A]';
  const optClass = 'mb-0.5 block text-[10px] text-[#A1A1AA]';

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#E4E4E7] bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E4E4E7] px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-[#09090B]">
              {step === 1 && 'Brand + Customer'}
              {step === 2 && 'Personality'}
              {step === 3 && 'Words + Style'}
            </p>
            <p className="text-xs text-[#71717A]">Step {step} of 3</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className={`h-1.5 w-6 rounded-full transition ${
                    n <= step ? 'bg-[#09090B]' : 'bg-[#E4E4E7]'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <label className="block">
                <span className={labelClass}>Brand name <span className="text-red-400">*</span></span>
                <input
                  autoFocus
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Your brand name"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>What does this brand do?</span>
                <span className={optClass}>Optional</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="One or two sentences about the brand."
                  rows={2}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Website</span>
                <span className={optClass}>Optional</span>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Primary customer / audience <span className="text-red-400">*</span></span>
                <input
                  type="text"
                  value={primaryAudience}
                  onChange={(e) => setPrimaryAudience(e.target.value)}
                  placeholder="Who are you selling to?"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Customer needs or problems</span>
                <span className={optClass}>Optional — comma-separated</span>
                <input
                  type="text"
                  value={customerNeeds}
                  onChange={(e) => setCustomerNeeds(e.target.value)}
                  placeholder="e.g. saves time, looks professional, affordable"
                  className={inputClass}
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <label className="block">
                <span className={labelClass}>Brand archetype</span>
                <span className={optClass}>Optional</span>
                <select
                  value={archetype}
                  onChange={(e) => setArchetype(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select an archetype…</option>
                  {ARCHETYPES.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>Brand traits</span>
                <span className={optClass}>Optional — comma-separated, up to 5</span>
                <input
                  type="text"
                  value={traits}
                  onChange={(e) => setTraits(e.target.value)}
                  placeholder="e.g. bold, warm, direct, playful"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Brand principles or pillars</span>
                <span className={optClass}>Optional — comma-separated</span>
                <input
                  type="text"
                  value={principles}
                  onChange={(e) => setPrinciples(e.target.value)}
                  placeholder="e.g. sustainability, community, quality"
                  className={inputClass}
                />
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <label className="block">
                <span className={labelClass}>Preferred words or phrases</span>
                <span className={optClass}>Optional — comma-separated</span>
                <input
                  type="text"
                  value={preferredWords}
                  onChange={(e) => setPreferredWords(e.target.value)}
                  placeholder="e.g. handcrafted, limited run, drop"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Words or phrases to avoid</span>
                <span className={optClass}>Optional — comma-separated</span>
                <input
                  type="text"
                  value={bannedWords}
                  onChange={(e) => setBannedWords(e.target.value)}
                  placeholder="e.g. cheap, sale, discount"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>CTA style notes</span>
                <span className={optClass}>Optional</span>
                <input
                  type="text"
                  value={ctaStyle}
                  onChange={(e) => setCtaStyle(e.target.value)}
                  placeholder="e.g. conversational, never pushy"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Brand colours</span>
                <span className={optClass}>Optional — comma-separated names or hex codes</span>
                <input
                  type="text"
                  value={palette}
                  onChange={(e) => setPalette(e.target.value)}
                  placeholder="e.g. #1A1A1A, ivory, forest green"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Fonts</span>
                <span className={optClass}>Optional — comma-separated</span>
                <input
                  type="text"
                  value={fonts}
                  onChange={(e) => setFonts(e.target.value)}
                  placeholder="e.g. Freight Display, Söhne"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Visual style notes</span>
                <span className={optClass}>Optional</span>
                <textarea
                  value={visualNotes}
                  onChange={(e) => setVisualNotes(e.target.value)}
                  placeholder="e.g. editorial, minimal, dark + moody"
                  rows={2}
                  className={inputClass}
                />
              </label>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#E4E4E7] px-6 py-4">
          <button
            type="button"
            onClick={() => (step > 1 ? setStep((s) => s - 1) : onClose())}
            className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm font-medium hover:bg-[#FAFAFA]"
          >
            {step > 1 ? 'Back' : 'Cancel'}
          </button>

          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 && !canAdvanceStep1}
              onClick={() => setStep((s) => s + 1)}
              className="rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#27272A] disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={saving || !canFinish}
              onClick={() => void handleFinish()}
              className="rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#27272A] disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create Brand'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
