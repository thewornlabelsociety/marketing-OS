import type { CreativeContent } from '../../types';

interface EditorFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  optional?: boolean;
  placeholder?: string;
}

function EditorField({ label, value, onChange, multiline, optional, placeholder }: EditorFieldProps) {
  const cls = 'mt-1 w-full rounded-md border border-[#E4E4E7] bg-white px-3 py-2 text-sm text-[#09090B] placeholder:text-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#09090B]';
  return (
    <div>
      <label className="block text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">
        {label}{optional && <span className="ml-1 normal-case text-[#D4D4D8]">optional</span>}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`${cls} resize-y`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </div>
  );
}

export function CreativeContentEditor({ content, onChange }: { content: CreativeContent; onChange: (c: CreativeContent) => void }) {
  switch (content.kind) {
    case 'STATIC_POST':
      return (
        <div className="space-y-4">
          <EditorField label="Hook" value={content.hook ?? ''} optional onChange={v => onChange({ ...content, hook: v || undefined })} />
          <EditorField label="Headline" value={content.headline ?? ''} optional onChange={v => onChange({ ...content, headline: v || undefined })} />
          <EditorField label="Caption" value={content.caption} multiline onChange={v => onChange({ ...content, caption: v })} />
          <EditorField label="CTA" value={content.cta ?? ''} optional onChange={v => onChange({ ...content, cta: v || undefined })} />
          <EditorField label="Visual direction" value={content.visualDirection ?? ''} optional multiline placeholder="Describe the image/visual for this post" onChange={v => onChange({ ...content, visualDirection: v || undefined })} />
          <EditorField label="Hashtags" value={(content.hashtags ?? []).join(' ')} optional placeholder="#tag1 #tag2" onChange={v => onChange({ ...content, hashtags: v ? v.split(/\s+/).filter(Boolean) : undefined })} />
        </div>
      );

    case 'CAROUSEL':
      return (
        <div className="space-y-4">
          <EditorField label="Caption" value={content.caption} multiline onChange={v => onChange({ ...content, caption: v })} />
          <div className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">Slides</p>
            {content.slides.map((slide, i) => (
              <div key={slide.slideNumber} className="rounded-lg border border-[#F4F4F5] p-3 space-y-3">
                <p className="text-[11px] font-semibold text-[#A1A1AA]">Slide {slide.slideNumber}</p>
                <EditorField label="Headline" value={slide.headline ?? ''} optional
                  onChange={v => {
                    const slides = [...content.slides];
                    slides[i] = { ...slides[i], headline: v || undefined };
                    onChange({ ...content, slides });
                  }} />
                <EditorField label="Body" value={slide.body ?? ''} optional multiline
                  onChange={v => {
                    const slides = [...content.slides];
                    slides[i] = { ...slides[i], body: v || undefined };
                    onChange({ ...content, slides });
                  }} />
                <EditorField label="Visual direction" value={slide.visualDirection ?? ''} optional
                  onChange={v => {
                    const slides = [...content.slides];
                    slides[i] = { ...slides[i], visualDirection: v || undefined };
                    onChange({ ...content, slides });
                  }} />
              </div>
            ))}
          </div>
          <EditorField label="CTA" value={content.cta ?? ''} optional onChange={v => onChange({ ...content, cta: v || undefined })} />
        </div>
      );

    case 'STORY':
      return (
        <div className="space-y-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">Frames</p>
          {content.frames.map((frame, i) => (
            <div key={frame.frameNumber} className="rounded-lg border border-[#F4F4F5] p-3 space-y-3">
              <p className="text-[11px] font-semibold text-[#A1A1AA]">Frame {frame.frameNumber}</p>
              <EditorField label="Headline" value={frame.headline ?? ''} optional
                onChange={v => {
                  const frames = [...content.frames];
                  frames[i] = { ...frames[i], headline: v || undefined };
                  onChange({ ...content, frames });
                }} />
              <EditorField label="Body" value={frame.body ?? ''} optional multiline
                onChange={v => {
                  const frames = [...content.frames];
                  frames[i] = { ...frames[i], body: v || undefined };
                  onChange({ ...content, frames });
                }} />
              <EditorField label="CTA" value={frame.cta ?? ''} optional
                onChange={v => {
                  const frames = [...content.frames];
                  frames[i] = { ...frames[i], cta: v || undefined };
                  onChange({ ...content, frames });
                }} />
              <EditorField label="Visual direction" value={frame.visualDirection ?? ''} optional
                onChange={v => {
                  const frames = [...content.frames];
                  frames[i] = { ...frames[i], visualDirection: v || undefined };
                  onChange({ ...content, frames });
                }} />
            </div>
          ))}
        </div>
      );

    case 'SHORT_VIDEO':
      return (
        <div className="space-y-4">
          <EditorField label="Title" value={content.title ?? ''} optional onChange={v => onChange({ ...content, title: v || undefined })} />
          <EditorField label="Hook" value={content.hook} onChange={v => onChange({ ...content, hook: v })} />
          <div className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">Scenes</p>
            {content.scenes.map((scene, i) => (
              <div key={scene.sceneNumber} className="rounded-lg border border-[#F4F4F5] p-3 space-y-3">
                <p className="text-[11px] font-semibold text-[#A1A1AA]">Scene {scene.sceneNumber}</p>
                <EditorField label="Visual direction" value={scene.visualDirection} multiline
                  onChange={v => {
                    const scenes = [...content.scenes];
                    scenes[i] = { ...scenes[i], visualDirection: v };
                    onChange({ ...content, scenes });
                  }} />
                <EditorField label="Spoken copy" value={scene.spokenCopy ?? ''} optional multiline
                  onChange={v => {
                    const scenes = [...content.scenes];
                    scenes[i] = { ...scenes[i], spokenCopy: v || undefined };
                    onChange({ ...content, scenes });
                  }} />
                <EditorField label="On-screen text" value={scene.onScreenText ?? ''} optional
                  onChange={v => {
                    const scenes = [...content.scenes];
                    scenes[i] = { ...scenes[i], onScreenText: v || undefined };
                    onChange({ ...content, scenes });
                  }} />
              </div>
            ))}
          </div>
          <EditorField label="Voiceover" value={content.voiceover ?? ''} optional multiline onChange={v => onChange({ ...content, voiceover: v || undefined })} />
          <EditorField label="Caption" value={content.caption ?? ''} optional multiline onChange={v => onChange({ ...content, caption: v || undefined })} />
          <EditorField label="CTA" value={content.cta ?? ''} optional onChange={v => onChange({ ...content, cta: v || undefined })} />
        </div>
      );

    case 'LONG_VIDEO':
      return (
        <div className="space-y-4">
          <EditorField label="Title" value={content.title} onChange={v => onChange({ ...content, title: v })} />
          <EditorField label="Hook" value={content.hook ?? ''} optional multiline onChange={v => onChange({ ...content, hook: v || undefined })} />
          <div className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">Outline</p>
            {content.outline.map((section, i) => (
              <div key={section.sectionNumber} className="rounded-lg border border-[#F4F4F5] p-3 space-y-3">
                <p className="text-[11px] font-semibold text-[#A1A1AA]">Section {section.sectionNumber}</p>
                <EditorField label="Heading" value={section.heading ?? ''} optional
                  onChange={v => {
                    const outline = [...content.outline];
                    outline[i] = { ...outline[i], heading: v || undefined };
                    onChange({ ...content, outline });
                  }} />
                <EditorField label="Body" value={section.body} multiline
                  onChange={v => {
                    const outline = [...content.outline];
                    outline[i] = { ...outline[i], body: v };
                    onChange({ ...content, outline });
                  }} />
              </div>
            ))}
          </div>
          <EditorField label="CTA" value={content.cta ?? ''} optional onChange={v => onChange({ ...content, cta: v || undefined })} />
        </div>
      );

    case 'EMAIL': {
      const bodyStr = typeof content.body === 'string'
        ? content.body
        : content.body.sections.map(s => (s.heading ? `## ${s.heading}\n${s.body}` : s.body)).join('\n\n');
      return (
        <div className="space-y-4">
          <EditorField label="Subject" value={content.subject} onChange={v => onChange({ ...content, subject: v })} />
          <EditorField label="Preheader" value={content.preheader ?? ''} optional onChange={v => onChange({ ...content, preheader: v || undefined })} />
          <EditorField label="Headline" value={content.headline ?? ''} optional onChange={v => onChange({ ...content, headline: v || undefined })} />
          <EditorField label="Body" value={bodyStr} multiline
            onChange={v => onChange({ ...content, body: v })} />
          <EditorField label="CTA" value={content.cta?.label ?? ''} optional
            onChange={v => onChange({ ...content, cta: v ? { ...content.cta, label: v } : undefined })} />
          <EditorField label="Footer notes" value={content.footerNotes ?? ''} optional
            onChange={v => onChange({ ...content, footerNotes: v || undefined })} />
        </div>
      );
    }

    case 'NEWSLETTER':
      return (
        <div className="space-y-4">
          <EditorField label="Subject" value={content.subject} onChange={v => onChange({ ...content, subject: v })} />
          <EditorField label="Preheader" value={content.preheader ?? ''} optional onChange={v => onChange({ ...content, preheader: v || undefined })} />
          <div className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">Sections</p>
            {content.sections.map((section, i) => (
              <div key={i} className="rounded-lg border border-[#F4F4F5] p-3 space-y-3">
                <EditorField label="Heading" value={section.heading ?? ''} optional
                  onChange={v => {
                    const sections = [...content.sections];
                    sections[i] = { ...sections[i], heading: v || undefined };
                    onChange({ ...content, sections });
                  }} />
                <EditorField label="Body" value={section.body} multiline
                  onChange={v => {
                    const sections = [...content.sections];
                    sections[i] = { ...sections[i], body: v };
                    onChange({ ...content, sections });
                  }} />
              </div>
            ))}
          </div>
          <EditorField label="CTA" value={content.cta?.label ?? ''} optional
            onChange={v => onChange({ ...content, cta: v ? { ...content.cta, label: v } : undefined })} />
          <EditorField label="Footer notes" value={content.footerNotes ?? ''} optional
            onChange={v => onChange({ ...content, footerNotes: v || undefined })} />
        </div>
      );

    case 'TEXT_POST':
      return (
        <div className="space-y-4">
          <EditorField label="Hook" value={content.hook ?? ''} optional onChange={v => onChange({ ...content, hook: v || undefined })} />
          <EditorField label="Body" value={content.body} multiline onChange={v => onChange({ ...content, body: v })} />
          <EditorField label="CTA" value={content.cta ?? ''} optional onChange={v => onChange({ ...content, cta: v || undefined })} />
        </div>
      );

    case 'ARTICLE':
      return (
        <div className="space-y-4">
          <EditorField label="Title" value={content.title} onChange={v => onChange({ ...content, title: v })} />
          <EditorField label="Excerpt" value={content.excerpt ?? ''} optional multiline onChange={v => onChange({ ...content, excerpt: v || undefined })} />
          <div className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">Sections</p>
            {content.sections.map((section, i) => (
              <div key={i} className="rounded-lg border border-[#F4F4F5] p-3 space-y-3">
                <EditorField label="Heading" value={section.heading ?? ''} optional
                  onChange={v => {
                    const sections = [...content.sections];
                    sections[i] = { ...sections[i], heading: v || undefined };
                    onChange({ ...content, sections });
                  }} />
                <EditorField label="Body" value={section.body} multiline
                  onChange={v => {
                    const sections = [...content.sections];
                    sections[i] = { ...sections[i], body: v };
                    onChange({ ...content, sections });
                  }} />
              </div>
            ))}
          </div>
          <EditorField label="CTA" value={content.cta ?? ''} optional onChange={v => onChange({ ...content, cta: v || undefined })} />
        </div>
      );

    case 'LANDING_PAGE':
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-[#F4F4F5] p-3 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]">Hero</p>
            <EditorField label="Eyebrow" value={content.hero.eyebrow ?? ''} optional
              onChange={v => onChange({ ...content, hero: { ...content.hero, eyebrow: v || undefined } })} />
            <EditorField label="Headline" value={content.hero.headline}
              onChange={v => onChange({ ...content, hero: { ...content.hero, headline: v } })} />
            <EditorField label="Supporting text" value={content.hero.supportingText ?? ''} optional multiline
              onChange={v => onChange({ ...content, hero: { ...content.hero, supportingText: v || undefined } })} />
            <EditorField label="CTA" value={content.hero.cta ?? ''} optional
              onChange={v => onChange({ ...content, hero: { ...content.hero, cta: v || undefined } })} />
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">Sections</p>
            {content.sections.map((section, i) => (
              <div key={i} className="rounded-lg border border-[#F4F4F5] p-3 space-y-3">
                <EditorField label="Heading" value={section.heading ?? ''} optional
                  onChange={v => {
                    const sections = [...content.sections];
                    sections[i] = { ...sections[i], heading: v || undefined };
                    onChange({ ...content, sections });
                  }} />
                <EditorField label="Body" value={section.body} multiline
                  onChange={v => {
                    const sections = [...content.sections];
                    sections[i] = { ...sections[i], body: v };
                    onChange({ ...content, sections });
                  }} />
              </div>
            ))}
          </div>
          <EditorField label="Closing CTA" value={content.closingCta ?? ''} optional
            onChange={v => onChange({ ...content, closingCta: v || undefined })} />
        </div>
      );

    default:
      return null;
  }
}
