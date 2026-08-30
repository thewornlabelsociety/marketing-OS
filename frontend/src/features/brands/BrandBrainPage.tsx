import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SopDrawerTrigger } from '../../components/drawers/SopDrawer';
import { AdvancedSection } from '../../components/ui/AdvancedSection';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { BrandBrain } from '../../types';

type Tab = 'identity' | 'audience' | 'voice' | 'visual' | 'marketing' | 'memory';

const TABS: { id: Tab; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'audience', label: 'Audience' },
  { id: 'voice', label: 'Voice & Language' },
  { id: 'visual', label: 'Visual' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'memory', label: 'Memory' },
];

const inputClass =
  'w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B] outline-none focus:border-[#A1A1AA]';
const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#71717A]';
const optClass = 'mb-1 block text-[10px] text-[#A1A1AA]';

function tagsToString(arr?: string[]): string {
  return arr?.join(', ') ?? '';
}

function stringToTags(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export default function BrandBrainPage() {
  const { activeEntity, refreshEntities } = useApp();
  const [tab, setTab] = useState<Tab>('identity');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const brain: BrandBrain = activeEntity?.brandKit?.brandBrain ?? {};

  // Identity
  const [name, setName] = useState(brain.identity?.name ?? activeEntity?.name ?? '');
  const [description, setDescription] = useState(brain.identity?.description ?? '');
  const [website, setWebsite] = useState(brain.identity?.website ?? '');
  const [market, setMarket] = useState(brain.identity?.market ?? '');

  // Audience
  const [primaryAudience, setPrimaryAudience] = useState(brain.audience?.primaryAudience ?? '');
  const [needs, setNeeds] = useState(tagsToString(brain.audience?.needs));
  const [problems, setProblems] = useState(tagsToString(brain.audience?.problems));
  const [desires, setDesires] = useState(tagsToString(brain.audience?.desires));

  // Voice & Language
  const [archetype, setArchetype] = useState(brain.personality?.archetype ?? '');
  const [traits, setTraits] = useState(tagsToString(brain.personality?.traits));
  const [principles, setPrinciples] = useState(tagsToString(brain.personality?.principles));
  const [preferredWords, setPreferredWords] = useState(tagsToString(brain.language?.preferredWords));
  const [bannedWords, setBannedWords] = useState(tagsToString(brain.language?.bannedWords));
  const [ctaStyle, setCtaStyle] = useState(brain.language?.ctaStyle ?? '');
  const [exampleCopy, setExampleCopy] = useState(brain.language?.exampleCopy ?? '');

  // Visual
  const [palette, setPalette] = useState(tagsToString(brain.visual?.palette));
  const [fonts, setFonts] = useState(tagsToString(brain.visual?.fonts));
  const [visualNotes, setVisualNotes] = useState(brain.visual?.visualStyleNotes ?? '');
  const [imageNotes, setImageNotes] = useState(brain.visual?.imageStyleNotes ?? '');

  // Marketing
  const [channels, setChannels] = useState(tagsToString(brain.marketing?.defaultChannels));
  const [pillars, setPillars] = useState(tagsToString(brain.marketing?.contentPillars));
  const [goals, setGoals] = useState(tagsToString(brain.marketing?.primaryGoals));

  // Memory (read-only in this phase)
  const perfLearnings = brain.memory?.marketPerformanceLearnings ?? [];
  const prefLearnings = brain.memory?.userPreferenceLearnings ?? [];

  // Re-sync when workspace changes
  useEffect(() => {
    const b: BrandBrain = activeEntity?.brandKit?.brandBrain ?? {};
    setName(b.identity?.name ?? activeEntity?.name ?? '');
    setDescription(b.identity?.description ?? '');
    setWebsite(b.identity?.website ?? '');
    setMarket(b.identity?.market ?? '');
    setPrimaryAudience(b.audience?.primaryAudience ?? '');
    setNeeds(tagsToString(b.audience?.needs));
    setProblems(tagsToString(b.audience?.problems));
    setDesires(tagsToString(b.audience?.desires));
    setArchetype(b.personality?.archetype ?? '');
    setTraits(tagsToString(b.personality?.traits));
    setPrinciples(tagsToString(b.personality?.principles));
    setPreferredWords(tagsToString(b.language?.preferredWords));
    setBannedWords(tagsToString(b.language?.bannedWords));
    setCtaStyle(b.language?.ctaStyle ?? '');
    setExampleCopy(b.language?.exampleCopy ?? '');
    setPalette(tagsToString(b.visual?.palette));
    setFonts(tagsToString(b.visual?.fonts));
    setVisualNotes(b.visual?.visualStyleNotes ?? '');
    setImageNotes(b.visual?.imageStyleNotes ?? '');
    setChannels(tagsToString(b.marketing?.defaultChannels));
    setPillars(tagsToString(b.marketing?.contentPillars));
    setGoals(tagsToString(b.marketing?.primaryGoals));
  }, [activeEntity?.id]);

  async function handleSave() {
    if (!activeEntity) return;
    setSaving(true);
    try {
      const updatedBrain: BrandBrain = {
        identity: {
          name: name.trim() || undefined,
          description: description.trim() || undefined,
          website: website.trim() || undefined,
          market: market.trim() || undefined,
        },
        audience: {
          primaryAudience: primaryAudience.trim() || undefined,
          needs: needs.trim() ? stringToTags(needs) : undefined,
          problems: problems.trim() ? stringToTags(problems) : undefined,
          desires: desires.trim() ? stringToTags(desires) : undefined,
        },
        personality: {
          archetype: archetype || undefined,
          traits: traits.trim() ? stringToTags(traits) : undefined,
          principles: principles.trim() ? stringToTags(principles) : undefined,
        },
        language: {
          preferredWords: preferredWords.trim() ? stringToTags(preferredWords) : undefined,
          bannedWords: bannedWords.trim() ? stringToTags(bannedWords) : undefined,
          ctaStyle: ctaStyle.trim() || undefined,
          exampleCopy: exampleCopy.trim() || undefined,
        },
        visual: {
          palette: palette.trim() ? stringToTags(palette) : undefined,
          fonts: fonts.trim() ? stringToTags(fonts) : undefined,
          visualStyleNotes: visualNotes.trim() || undefined,
          imageStyleNotes: imageNotes.trim() || undefined,
        },
        marketing: {
          defaultChannels: channels.trim() ? stringToTags(channels) : undefined,
          contentPillars: pillars.trim() ? stringToTags(pillars) : undefined,
          primaryGoals: goals.trim() ? stringToTags(goals) : undefined,
        },
        memory: activeEntity.brandKit.brandBrain?.memory,
      };

      await api.patchBrandKit(activeEntity.id, { brandBrain: updatedBrain });
      await refreshEntities();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (!activeEntity) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-sm text-[#71717A]">
        Select a workspace to edit Brand Brain.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] bg-white px-6 py-4">
        <div>
          <h1 className="text-base font-semibold text-[#09090B]">Brand Brain</h1>
          <p className="text-xs text-[#71717A]">{activeEntity.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <SopDrawerTrigger context="Brand Brain setup" />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#09090B] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#27272A] disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-[#E4E4E7] bg-white px-6">
        <div className="flex gap-0">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
                tab === id
                  ? 'border-[#09090B] text-[#09090B]'
                  : 'border-transparent text-[#71717A] hover:text-[#09090B]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-5">
          {tab === 'identity' && (
            <>
              <label className="block">
                <span className={labelClass}>Brand name</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Description</span>
                <span className={optClass}>What does this brand do?</span>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Website</span>
                <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Market / category</span>
                <span className={optClass}>The industry or space this brand operates in</span>
                <input type="text" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="e.g. streetwear, B2B SaaS, artisan food" className={inputClass} />
              </label>
            </>
          )}

          {tab === 'audience' && (
            <>
              <label className="block">
                <span className={labelClass}>Primary customer / audience</span>
                <input type="text" value={primaryAudience} onChange={(e) => setPrimaryAudience(e.target.value)} placeholder="Who are you selling to?" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Customer needs</span>
                <span className={optClass}>Comma-separated</span>
                <input type="text" value={needs} onChange={(e) => setNeeds(e.target.value)} placeholder="e.g. saves time, looks professional" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Customer problems</span>
                <span className={optClass}>Comma-separated</span>
                <input type="text" value={problems} onChange={(e) => setProblems(e.target.value)} placeholder="e.g. overwhelmed by choices, limited budget" className={inputClass} />
              </label>
              <AdvancedSection>
                <label className="block">
                  <span className={labelClass}>Customer desires</span>
                  <span className={optClass}>Comma-separated — what they want to feel or become</span>
                  <input type="text" value={desires} onChange={(e) => setDesires(e.target.value)} placeholder="e.g. confident, seen, successful" className={inputClass} />
                </label>
              </AdvancedSection>
            </>
          )}

          {tab === 'voice' && (
            <>
              <label className="block">
                <span className={labelClass}>Brand archetype</span>
                <select value={archetype} onChange={(e) => setArchetype(e.target.value)} className={inputClass}>
                  <option value="">Select…</option>
                  {['The Hero', 'The Innocent', 'The Explorer', 'The Sage', 'The Outlaw', 'The Magician', 'The Regular Person', 'The Lover', 'The Jester', 'The Caregiver', 'The Ruler', 'The Creator'].map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>Brand traits</span>
                <span className={optClass}>Comma-separated — up to 5</span>
                <input type="text" value={traits} onChange={(e) => setTraits(e.target.value)} placeholder="e.g. bold, warm, direct, playful" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Brand principles</span>
                <span className={optClass}>Comma-separated</span>
                <input type="text" value={principles} onChange={(e) => setPrinciples(e.target.value)} placeholder="e.g. transparency, quality, community" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Preferred words / phrases</span>
                <span className={optClass}>Comma-separated</span>
                <input type="text" value={preferredWords} onChange={(e) => setPreferredWords(e.target.value)} placeholder="e.g. handcrafted, limited run, drop" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Words / phrases to avoid</span>
                <span className={optClass}>Comma-separated</span>
                <input type="text" value={bannedWords} onChange={(e) => setBannedWords(e.target.value)} placeholder="e.g. cheap, discount, sale" className={inputClass} />
              </label>
              <AdvancedSection>
                <label className="block">
                  <span className={labelClass}>CTA style</span>
                  <input type="text" value={ctaStyle} onChange={(e) => setCtaStyle(e.target.value)} placeholder="e.g. conversational, never aggressive" className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Example copy</span>
                  <span className={optClass}>A sample caption or blurb that sounds on-brand</span>
                  <textarea value={exampleCopy} onChange={(e) => setExampleCopy(e.target.value)} rows={3} className={inputClass} />
                </label>
              </AdvancedSection>
            </>
          )}

          {tab === 'visual' && (
            <>
              <label className="block">
                <span className={labelClass}>Colour palette</span>
                <span className={optClass}>Comma-separated — names or hex codes</span>
                <input type="text" value={palette} onChange={(e) => setPalette(e.target.value)} placeholder="e.g. #1A1A1A, ivory, forest green" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Fonts</span>
                <span className={optClass}>Comma-separated</span>
                <input type="text" value={fonts} onChange={(e) => setFonts(e.target.value)} placeholder="e.g. Freight Display, Söhne" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Visual style notes</span>
                <input type="text" value={visualNotes} onChange={(e) => setVisualNotes(e.target.value)} placeholder="e.g. editorial, minimal, dark + moody" className={inputClass} />
              </label>
              <AdvancedSection>
                <label className="block">
                  <span className={labelClass}>Image / photography style</span>
                  <input type="text" value={imageNotes} onChange={(e) => setImageNotes(e.target.value)} placeholder="e.g. natural light, lifestyle, no people" className={inputClass} />
                </label>
              </AdvancedSection>
            </>
          )}

          {tab === 'marketing' && (
            <>
              <label className="block">
                <span className={labelClass}>Default channels</span>
                <span className={optClass}>Comma-separated — where this brand typically publishes</span>
                <input type="text" value={channels} onChange={(e) => setChannels(e.target.value)} placeholder="e.g. instagram, email, tiktok" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Content pillars</span>
                <span className={optClass}>Comma-separated — recurring topics or themes</span>
                <input type="text" value={pillars} onChange={(e) => setPillars(e.target.value)} placeholder="e.g. education, behind the scenes, product" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Primary goals</span>
                <span className={optClass}>Comma-separated — what marketing is trying to achieve</span>
                <input type="text" value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="e.g. grow email list, increase conversions" className={inputClass} />
              </label>
            </>
          )}

          {tab === 'memory' && (
            <div className="space-y-5">
              <div>
                <p className={labelClass}>Performance learnings</p>
                <p className={optClass}>Updated automatically when performance is synced.</p>
                {perfLearnings.length === 0 ? (
                  <p className="text-sm text-[#A1A1AA]">No learnings yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {perfLearnings.map((l, i) => (
                      <li key={i} className="rounded-lg border border-[#E4E4E7] px-4 py-2.5 text-sm text-[#09090B]">{l}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className={labelClass}>Preference learnings</p>
                {prefLearnings.length === 0 ? (
                  <p className="text-sm text-[#A1A1AA]">No learnings yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {prefLearnings.map((l, i) => (
                      <li key={i} className="rounded-lg border border-[#E4E4E7] px-4 py-2.5 text-sm text-[#09090B]">{l}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
