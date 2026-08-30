/** DETERMINISTIC_FIXTURE — labelled test creative only. Not AI output. */

export const CAROUSEL_CREATIVE_FIXTURE = {
  kind: 'CAROUSEL',
  caption: 'Three reasons this product solves the problem you feel every day.',
  slides: [
    { slideNumber: 1, headline: 'The problem', body: 'You need a reliable solution without extra friction.', visualDirection: 'Product in context' },
    { slideNumber: 2, headline: 'The proof', body: 'See how the product works in real use.', visualDirection: 'Close-up demonstration' },
    { slideNumber: 3, headline: 'The outcome', body: 'A clearer result you can trust.', visualDirection: 'Result-focused frame' },
    { slideNumber: 4, headline: 'Why now', body: 'Built for customers who want quality without compromise.', visualDirection: 'Product hero' },
    { slideNumber: 5, headline: 'Take the next step', body: 'Explore the product and decide with confidence.', visualDirection: 'CTA-focused frame' },
  ],
  cta: 'Learn more',
  visualDirection: 'Portrait carousel, product in context',
};

export const REEL_CREATIVE_FIXTURE = {
  kind: 'SHORT_VIDEO',
  title: 'Show the Product Solving the Problem',
  hook: 'Watch what happens when the product meets the real problem.',
  durationTargetSeconds: 15,
  scenes: [
    { sceneNumber: 1, durationSeconds: 3, visualDirection: 'Open on the customer problem in motion', spokenCopy: 'This is the problem.', onScreenText: 'The problem' },
    { sceneNumber: 2, durationSeconds: 8, visualDirection: 'Demonstrate the product solving it', spokenCopy: 'Here is the product working.', onScreenText: 'See it work' },
    { sceneNumber: 3, durationSeconds: 4, visualDirection: 'Close on result and CTA', spokenCopy: 'That is the difference.', onScreenText: 'Learn more' },
  ],
  voiceover: 'Problem, proof, result.',
  caption: 'See the product solve the problem in seconds.',
  cta: 'Learn more',
  shotRequirements: ['1 vertical demonstration clip'],
};

export const NEWSLETTER_CREATIVE_FIXTURE = {
  kind: 'NEWSLETTER',
  subject: 'The proof you needed before deciding',
  preheader: 'See why this product solves the problem',
  sections: [
    { heading: 'The problem', body: 'Customers feel the friction before they find the right solution.' },
    { heading: 'The proof', body: 'This product was built to solve that exact problem with visible results.' },
    { heading: 'What to do next', body: 'Explore the product and decide with confidence.' },
  ],
  cta: { label: 'Shop the product', destinationDescription: 'Product page link from campaign context' },
};

export const INVALID_CAROUSEL_NO_SLIDES = { kind: 'CAROUSEL', caption: 'Missing slides', slides: [] };
export const INVALID_CAROUSEL_11_SLIDES = {
  kind: 'CAROUSEL',
  caption: 'Too many slides',
  slides: Array.from({ length: 11 }, (_, i) => ({ slideNumber: i + 1, body: `Slide ${i + 1}` })),
};
export const INVALID_REEL_NO_HOOK = { kind: 'SHORT_VIDEO', hook: '', scenes: [{ sceneNumber: 1, visualDirection: 'Test' }] };
export const INVALID_EMAIL_NO_SUBJECT = { kind: 'EMAIL', subject: '', body: 'Body only' };

export const CAROUSEL_V2_FIXTURE = {
  ...CAROUSEL_CREATIVE_FIXTURE,
  slides: CAROUSEL_CREATIVE_FIXTURE.slides.map((slide, index) =>
    index === 4 ? { ...slide, body: 'Explore the product with a clearer CTA today.', headline: 'Decide with confidence' } : slide,
  ),
};
