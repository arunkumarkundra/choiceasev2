/* ==========================================================================
   Choicease — assist.js
   Free AI help (context-aware copy-prompts + Helper GPT link), the offline
   starter-criteria library, and the sample decision.
   Pure data + string builders; no DOM access.
   ========================================================================== */

export const HELPER_GPT_URL =
  'https://chatgpt.com/g/g-68b3ef768f2c8191bebc43b388a95a87-choicease-com-helper-gpt';

/* ----------------------- Context-aware AI prompts ------------------------ */
/* These embed the user's actual decision so pasting into ChatGPT, Claude, or
   Gemini yields immediately relevant help — free, no API keys, any assistant. */

export function criteriaPrompt(decision) {
  const options = decision.options.map((o) => `- ${o.name}${o.description ? ` (${o.description})` : ''}`).join('\n');
  return `I'm making this decision: "${decision.title || 'an important choice'}".
${decision.description ? `Context: ${decision.description}\n` : ''}${options ? `The options I'm comparing:\n${options}\n` : ''}
Suggest 5–7 criteria I should judge these options on. For each: a short name (2–4 words) and a one-line note on what it measures. Prefer criteria that actually differentiate these options. Also flag one criterion people typically forget for this kind of decision.`;
}

export function weightsPrompt(decision) {
  const criteria = decision.criteria.map((c) => `- ${c.name}${c.description ? ` (${c.description})` : ''}`).join('\n');
  return `I'm making this decision: "${decision.title || 'an important choice'}".
${decision.description ? `Context: ${decision.description}\n` : ''}My criteria:
${criteria}

Help me set an importance level for each criterion on a 1–5 scale (1 = marginal, 5 = critical). Ask me at most two clarifying questions if needed, then give a recommended level per criterion with a one-line justification. Warn me if I'm treating everything as equally important.`;
}

export function ratingsPrompt(decision) {
  const options = decision.options.map((o) => `- ${o.name}${o.description ? ` (${o.description})` : ''}`).join('\n');
  const criteria = decision.criteria.map((c) => `- ${c.name}${c.description ? ` (${c.description})` : ''}`).join('\n');
  return `I'm making this decision: "${decision.title || 'an important choice'}".
${decision.description ? `Context: ${decision.description}\n` : ''}Options:
${options}

Criteria:
${criteria}

Help me rate each option on each criterion using a 0–5 scale (0 = unacceptable, 2.5 = middling, 5 = excellent; decimals allowed). Where you have general knowledge, propose a rating with a one-line reason; where it depends on my situation, ask me a pointed question instead of guessing. Present the result as a table.`;
}

/* --------------------- Offline starter-criteria library ------------------ */
/* One-tap suggestions for common decision types. Instant, free, no AI. */

export const STARTER_CRITERIA = [
  {
    label: 'Job offer',
    match: /job|offer|role|career|employer/i,
    criteria: [
      { name: 'Compensation', description: 'Salary, bonus, equity, benefits' },
      { name: 'Growth & learning', description: 'Skills, trajectory, mentorship' },
      { name: 'Work-life balance', description: 'Hours, flexibility, commute' },
      { name: 'Team & culture', description: 'People, values, management quality' },
      { name: 'Job security', description: 'Company health and role stability' },
    ],
  },
  {
    label: 'Vendor / supplier',
    match: /vendor|supplier|contract|agency|provider|procurement/i,
    criteria: [
      { name: 'Total cost of ownership', description: 'Price, implementation, running costs' },
      { name: 'Quality & reliability', description: 'Track record, SLAs, references' },
      { name: 'Delivery risk', description: 'Timeline credibility, dependencies' },
      { name: 'Support & partnership', description: 'Responsiveness, account management' },
      { name: 'Scalability', description: 'Ability to grow with your needs' },
    ],
  },
  {
    label: 'Major purchase',
    match: /buy|purchase|laptop|phone|car|appliance|camera/i,
    criteria: [
      { name: 'Price & value', description: 'Cost vs what you get' },
      { name: 'Quality & durability', description: 'Build, reviews, longevity' },
      { name: 'Features & fit', description: 'Does it do what you actually need' },
      { name: 'Running costs', description: 'Maintenance, consumables, resale' },
      { name: 'After-sales support', description: 'Warranty, service network' },
    ],
  },
  {
    label: 'Hiring a candidate',
    match: /hir|candidate|recruit|interview/i,
    criteria: [
      { name: 'Role competence', description: 'Skills and evidence of delivery' },
      { name: 'Learning agility', description: 'Speed of picking up new ground' },
      { name: 'Team fit', description: 'Collaboration and values alignment' },
      { name: 'Ownership', description: 'Initiative and accountability' },
      { name: 'Compensation fit', description: 'Expectations vs budget' },
    ],
  },
  {
    label: 'Where to live / relocate',
    match: /city|relocat|move|apartment|house|flat|home/i,
    criteria: [
      { name: 'Cost of living', description: 'Rent, taxes, daily expenses' },
      { name: 'Career opportunities', description: 'Jobs, network, growth' },
      { name: 'Quality of life', description: 'Safety, climate, healthcare' },
      { name: 'Community & family', description: 'Friends, schools, support' },
      { name: 'Commute & connectivity', description: 'Transport, airport access' },
    ],
  },
  {
    label: 'Build vs buy (tech)',
    match: /build|buy|software|tool|platform|saas/i,
    criteria: [
      { name: 'Total cost (3-year)', description: 'Build + run vs license fees' },
      { name: 'Time to value', description: 'How fast it delivers' },
      { name: 'Strategic control', description: 'IP, roadmap, lock-in' },
      { name: 'Maintenance burden', description: 'Ongoing engineering load' },
      { name: 'Fit to requirements', description: 'Coverage of must-haves' },
    ],
  },
];

export function suggestStarterSet(title) {
  return STARTER_CRITERIA.find((s) => s.match.test(title || '')) || null;
}

/* ---------------------------- Sample decision ---------------------------- */
/* "Choosing a family car" — loads a complete, realistic decision so a
   first-time visitor sees the full experience in one tap. */

export function sampleDecision() {
  const O = { swift: 9001, creta: 9002, ertiga: 9003, city: 9004 };
  const C = { price: 9101, safety: 9102, space: 9103, mileage: 9104, resale: 9105 };
  return {
    title: 'Choosing our family car',
    description: 'Two kids, city driving on weekdays, one long road trip a month. Budget-conscious but safety comes first.',
    timestamp: new Date().toISOString(),
    options: [
      { id: O.swift, name: 'Maruti Swift', description: 'Zippy hatchback, easy in city traffic' },
      { id: O.creta, name: 'Hyundai Creta', description: 'Compact SUV, commanding view, feature-loaded' },
      { id: O.ertiga, name: 'Maruti Ertiga', description: '7-seater MPV, grandparents fit too' },
      { id: O.city, name: 'Honda City', description: 'Refined sedan, comfortable highway cruiser' },
    ],
    criteria: [
      { id: C.price, name: 'Price & value', description: 'On-road price against what you get' },
      { id: C.safety, name: 'Safety', description: 'Crash ratings, airbags, driver aids' },
      { id: C.space, name: 'Space & comfort', description: 'Seats, boot, long-trip comfort' },
      { id: C.mileage, name: 'Fuel economy', description: 'Real-world km per litre' },
      { id: C.resale, name: 'Resale value', description: 'Expected value after 5 years' },
    ],
    weights: { [C.price]: 4, [C.safety]: 5, [C.space]: 4, [C.mileage]: 3, [C.resale]: 2 },
    normalizedWeights: {},
    ratings: {
      [`${O.swift}-${C.price}`]: 4.5, [`${O.swift}-${C.safety}`]: 2.5, [`${O.swift}-${C.space}`]: 2.5, [`${O.swift}-${C.mileage}`]: 4.5, [`${O.swift}-${C.resale}`]: 4.0,
      [`${O.creta}-${C.price}`]: 2.5, [`${O.creta}-${C.safety}`]: 4.0, [`${O.creta}-${C.space}`]: 4.0, [`${O.creta}-${C.mileage}`]: 3.0, [`${O.creta}-${C.resale}`]: 4.0,
      [`${O.ertiga}-${C.price}`]: 3.5, [`${O.ertiga}-${C.safety}`]: 3.0, [`${O.ertiga}-${C.space}`]: 5.0, [`${O.ertiga}-${C.mileage}`]: 4.0, [`${O.ertiga}-${C.resale}`]: 3.5,
      [`${O.city}-${C.price}`]: 3.0, [`${O.city}-${C.safety}`]: 4.5, [`${O.city}-${C.space}`]: 3.5, [`${O.city}-${C.mileage}`]: 3.5, [`${O.city}-${C.resale}`]: 3.5,
    },
    version: '1.1',
  };
}
