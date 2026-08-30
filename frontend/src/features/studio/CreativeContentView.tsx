import type { CreativeContent } from '../../types';

export function CreativeContentView({ content }: { content: CreativeContent }) {
  switch (content.kind) {
    case 'STATIC_POST':
      return (
        <div className="space-y-3 text-sm">
          {content.hook && <Field label="Hook" value={content.hook} />}
          {content.headline && <Field label="Headline" value={content.headline} />}
          <Field label="Caption" value={content.caption} />
          {content.cta && <Field label="CTA" value={content.cta} />}
          {content.visualDirection && <Field label="Visual direction" value={content.visualDirection} muted />}
        </div>
      );
    case 'CAROUSEL':
      return (
        <div className="space-y-4 text-sm">
          <Field label="Caption" value={content.caption} />
          <ol className="space-y-3">
            {content.slides.map((slide) => (
              <li key={slide.slideNumber} className="rounded-lg border border-[#F4F4F5] p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">Slide {slide.slideNumber}</p>
                {slide.headline && <p className="mt-1 font-medium text-[#09090B]">{slide.headline}</p>}
                {slide.body && <p className="mt-1 text-[#71717A]">{slide.body}</p>}
                {slide.visualDirection && <p className="mt-1 text-xs text-[#A1A1AA]">{slide.visualDirection}</p>}
              </li>
            ))}
          </ol>
          {content.cta && <Field label="CTA" value={content.cta} />}
        </div>
      );
    case 'STORY':
      return (
        <ol className="space-y-3 text-sm">
          {content.frames.map((frame) => (
            <li key={frame.frameNumber} className="rounded-lg border border-[#F4F4F5] p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">Frame {frame.frameNumber}</p>
              {frame.headline && <p className="mt-1 font-medium text-[#09090B]">{frame.headline}</p>}
              {frame.body && <p className="mt-1 text-[#71717A]">{frame.body}</p>}
              {frame.cta && <p className="mt-1 text-xs text-[#71717A]">CTA · {frame.cta}</p>}
            </li>
          ))}
        </ol>
      );
    case 'SHORT_VIDEO':
    case 'LONG_VIDEO':
      return (
        <div className="space-y-4 text-sm">
          {content.title && <Field label="Title" value={content.title} />}
          {'hook' in content && content.hook && <Field label="Hook" value={content.hook} />}
          <div className="space-y-3">
            {('scenes' in content ? content.scenes : []).map((scene) => (
              <div key={scene.sceneNumber} className="rounded-lg border border-[#F4F4F5] p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">
                  Scene {scene.sceneNumber}
                  {scene.durationSeconds ? ` · ${scene.durationSeconds}s` : ''}
                </p>
                <p className="mt-1 text-[#71717A]">{scene.visualDirection}</p>
                {'spokenCopy' in scene && scene.spokenCopy && <p className="mt-1">Voice · {scene.spokenCopy}</p>}
                {'onScreenText' in scene && scene.onScreenText && <p className="mt-1 text-xs text-[#A1A1AA]">On-screen · {scene.onScreenText}</p>}
              </div>
            ))}
          </div>
          {'voiceover' in content && content.voiceover && <Field label="Voiceover" value={content.voiceover} />}
          {'caption' in content && content.caption && <Field label="Caption" value={content.caption} />}
          {content.cta && <Field label="CTA" value={content.cta} />}
        </div>
      );
    case 'EMAIL':
      return (
        <div className="space-y-3 text-sm">
          <Field label="Subject" value={content.subject} />
          {content.preheader && <Field label="Preheader" value={content.preheader} />}
          {typeof content.body === 'string' ? (
            <Field label="Body" value={content.body} />
          ) : (
            content.body.sections.map((section, index) => (
              <div key={index}>
                {section.heading && <p className="font-medium text-[#09090B]">{section.heading}</p>}
                <p className="text-[#71717A]">{section.body}</p>
              </div>
            ))
          )}
          {content.cta && <Field label="CTA" value={content.cta.label} />}
        </div>
      );
    case 'NEWSLETTER':
      return (
        <div className="space-y-3 text-sm">
          <Field label="Subject" value={content.subject} />
          {content.preheader && <Field label="Preheader" value={content.preheader} />}
          {content.sections.map((section, index) => (
            <div key={index}>
              {section.heading && <p className="font-medium text-[#09090B]">{section.heading}</p>}
              <p className="text-[#71717A]">{section.body}</p>
            </div>
          ))}
          {content.cta && <Field label="CTA" value={content.cta.label} />}
        </div>
      );
    case 'TEXT_POST':
      return (
        <div className="space-y-3 text-sm">
          {content.hook && <Field label="Hook" value={content.hook} />}
          <Field label="Body" value={content.body} />
          {content.cta && <Field label="CTA" value={content.cta} />}
        </div>
      );
    case 'ARTICLE':
      return (
        <div className="space-y-3 text-sm">
          <Field label="Title" value={content.title} />
          {content.excerpt && <Field label="Excerpt" value={content.excerpt} />}
          {content.sections.map((section, index) => (
            <div key={index}>
              {section.heading && <p className="font-medium text-[#09090B]">{section.heading}</p>}
              <p className="text-[#71717A]">{section.body}</p>
            </div>
          ))}
        </div>
      );
    case 'LANDING_PAGE':
      return (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-[#F4F4F5] p-3">
            {content.hero.eyebrow && <p className="text-xs uppercase tracking-wide text-[#A1A1AA]">{content.hero.eyebrow}</p>}
            <p className="text-base font-semibold text-[#09090B]">{content.hero.headline}</p>
            {content.hero.supportingText && <p className="mt-1 text-[#71717A]">{content.hero.supportingText}</p>}
            {content.hero.cta && <p className="mt-2 text-sm font-medium">{content.hero.cta}</p>}
          </div>
          {content.sections.map((section, index) => (
            <div key={index}>
              {section.heading && <p className="font-medium text-[#09090B]">{section.heading}</p>}
              <p className="text-[#71717A]">{section.body}</p>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">{label}</p>
      <p className={`mt-1 ${muted ? 'text-[#71717A]' : 'text-[#09090B]'}`}>{value}</p>
    </div>
  );
}
