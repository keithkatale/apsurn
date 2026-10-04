/**
 * Marketing playbooks for apsurn's AI. Condensed and adapted from the MIT-licensed
 * "Marketing Skills" collection by Corey Haines (github.com/coreyhaines31/marketingskills).
 * See skills/marketing/NOTICE.md for the licence and sources.
 *
 * Each skill is plain guidance the model reads before writing. Keep them dense: they are
 * injected into prompts and returned by the get_marketing_skill tool.
 */

export interface MarketingSkill {
  id: string;
  title: string;
  whenToUse: string;
  body: string;
}

const AI_TELLS = `Never write these (readers spot them instantly and stop trusting the email):
- Contrast reveals: "It's not X, it's Y". State Y directly and say why.
- Negation lists: "No setup, no templates, no waiting". Say what does happen.
- Trailing pile-ons: a claim followed by a comma and a restatement. End the sentence at the claim.
- Self-answered questions: "The result? 3x faster." Just state it.
- Stock openers and filler: "I hope this finds you well", "Quick question" as an opener, "Just checking in", "Here's the thing", "Say goodbye to", "Unlock the power of", "Feel free to reach out".
- Empty words: seamless, robust, powerful, streamline, leverage, synergy, best-in-class, cutting-edge, game-changer.
- Em dashes in subject lines and short copy. Exclamation marks.
- Any line that would work unchanged in a competitor's email. If proof is missing, leave it out; never invent it.`;

export const MARKETING_SKILLS: MarketingSkill[] = [
  {
    id: "cold-email",
    title: "Cold email",
    whenToUse: "Any first-touch or follow-up email to someone who has not heard from the sender.",
    body: `# Cold email

## Principles
- Peer voice. Write like a sharp colleague, not a sales tool. Contractions are fine. It must sound human read aloud.
- Brevity. Every sentence has to move the reader toward a reply. Cut the rest.
- Problem first. Lead with the reader's world ("you", "your"), not "I" or "we".
- Connected personalization. The observation about them must lead naturally to why you are writing. A fact with no link to the pitch is decoration.
- One low-friction ask. Interest-based asks beat meeting demands. One call to action per email. Never ask for 30 minutes on the first touch.

## Pick the shape that fits the signal (and vary it between recipients)
1. Observation, problem, proof, ask: "Noticed X, which usually means Y. We helped Z with it. Worth a look?"
2. Question, value, ask: a real question about their situation, then what you do and one result.
3. Trigger, insight, ask: something that just changed for them (hire, launch, funding, tooling), what that tends to cause, and how you have handled it.
4. Story, bridge, ask: a similar company, the problem, how it was solved, why that might apply.
5. Contrarian insight, ask: one thing most people in their role get wrong, backed by a specific example.
6. Give first: offer one concrete, useful thing (a teardown, a list, a number) and ask permission to send it.

## Voice by audience
- Executive or founder: very short, understated, peer to peer.
- Mid-level manager: specific value and a little more detail.
- Technical: precise, no fluff, respect their intelligence.

## Personalization ladder (use the highest level the data supports, never fake one)
1. Role or company type. 2. A company signal (hiring, funding, stack change, new product). 3. An individual signal (a post, a talk, a public decision). 4. A relationship signal (shared connection, past contact).
Weak signals still work. Do not block on missing data. Use what you actually have and stay relevant through their role's problem.

## Subject lines
2 to 5 words, lowercase is fine, no punctuation tricks, no emoji, no first name, no pitch, no urgency. Think of something a colleague would write internally ("hiring ops", "q3 pipeline"). Its only job is to get opened and it must match the body.

## Follow-ups
3 to 5 emails total with growing gaps. Each stands alone and adds something new: a different angle, a proof point, a short insight or a resource. Never "just checking in". The last email is a clear, polite breakup and you honor it.

## Writing the ask
Specific and easy: "Worth me sending the 2-minute teardown?", "Is this on your radar this quarter or later?", "Who owns this on your side?". Avoid "learn more", "hop on a call", "pick your brain".

## Banned
${AI_TELLS}

## Checklist before finishing
Would I reply to this? Does every sentence serve the reader? Does the personalization connect to the problem? One easy ask? One specific proof point (or none, never a fake one)? No AI tells, no jargon, no signature block, no links unless essential?`,
  },
  {
    id: "copywriting",
    title: "Copywriting",
    whenToUse: "Landing pages, website copy, one-pagers, ads, demo pages and any persuasive text.",
    body: `# Copywriting

## Principles
- Clarity beats cleverness. If the reader has to decode it, they leave.
- Benefits over features. A feature says what it does; a benefit says what changes for the customer.
- Specific over vague. "4 hours to 15 minutes" beats "save time".
- Customer language over company language. Reuse the words buyers use in reviews, calls and tickets.
- One idea per section. Each block advances one argument in a logical order.

## Style rules
Simple words ("use", not "utilize"). Active voice. Confident, with no hedging words. Show the outcome instead of adding adverbs. Honest: never invent statistics or testimonials. If proof is missing, mark it "[NEED: ...]" instead of making it up.

## Headlines
State the single most important message and the core value. Useful shapes: "{Outcome} without {pain}", "The {category} for {audience}", "Never {unpleasant thing} again", or a question that names the main pain. Offer 2 or 3 options with a reason for each.

## Page structure
Headline and subheadline (1 to 2 sentences), a primary call to action, social proof, the problem, 3 to 5 benefits, how it works in 3 or 4 steps, objection handling (FAQ, comparison, guarantee), final call to action with risk reversal.

## Calls to action
Weak: Submit, Learn more, Get started. Strong: verb plus what they get ("See it on your data", "Get the audit"). Match the CTA to the visitor's stage.

## Voice
Fix formality and personality before writing (playful or serious, bold or understated, technical or plain). Headlines can be bolder, body copy clearer, CTAs most direct.

## Banned
${AI_TELLS}

## Before writing, know
The page's single goal, the audience and their objections, the offer and what makes it different, the proof available, and where the reader comes from.`,
  },
  {
    id: "email-sequences",
    title: "Email sequences and campaigns",
    whenToUse: "Planning or writing multi-step sequences: outbound, nurture, onboarding, win-back, newsletters.",
    body: `# Email sequences

## Principles
- One email, one job, one primary call to action.
- Value before the ask. Earn the right to sell.
- Relevance over volume. Fewer, better, segmented emails win.
- Every email shows a clear next step.

## Sequence arcs (choose by goal, not habit)
- Outbound (cold): 3 to 5 emails. Angle, then proof, then insight or resource, then objection, then breakup. New information every time.
- Lead nurture: 6 to 8 emails over 2 to 3 weeks. Deliver the resource, expand the topic, dig into the problem, show the solution approach, a case study, differentiation, objection handling, a direct offer.
- Welcome: 5 to 7 emails over about 2 weeks. Welcome and value, a quick win, the story, social proof, objections, a feature highlight, conversion.
- Re-engagement: 3 to 4 emails over 2 weeks after 30 to 60 days of silence. Genuine check-in, value reminder, incentive, last call.
- Onboarding: supports the in-app flow, never duplicates it. First step, help, feature highlight, success story, check-in, advanced tip, upgrade prompt.

## Timing
B2B: weekdays, mid-morning in the recipient's time zone. Start tight (1 to 3 days), then widen. State exit conditions: a reply, a booking or a bounce stops the sequence.

## Per-email craft
Hook, context, value, one call to action, human sign-off. Short paragraphs of 1 to 3 sentences. Plain text for outbound. Subject lines 40 to 60 characters for marketing mail (shorter for cold), clear beats clever, preview text that extends the subject instead of repeating it. Length: outbound 50 to 125 words, educational 150 to 300.

## Make every sequence different
Never reuse one skeleton across audiences. Change the angle, the proof, the opening move and the ask by persona, pain and signal. A sequence for a VP of Sales should not read like one for a founder.

## Banned
${AI_TELLS}

## Checklist
Entry trigger, goal, what they already know, timing, exit conditions, segmentation, one purpose per email, value before asks, no AI tells, specific call to action, what to measure.`,
  },
  {
    id: "copy-editing",
    title: "Copy editing (final pass)",
    whenToUse: "Polishing any draft before it is shown or sent.",
    body: `# Copy editing: seven sweeps

Run these in order on every draft, then repeat after edits.
1. Clarity. Remove confusing structure, vague pronouns, jargon. One main idea per section. Speak to the reader ("you").
2. Voice and tone. No shifts between formal and casual. Read it aloud.
3. So what. Every claim must answer "why should I care?" Connect features to outcomes ("which means...").
4. Prove it. Support claims with evidence or soften them. Flag "industry-leading", "trusted by thousands" with nothing behind them.
5. Specificity. Replace vague words with numbers, timeframes and examples. Delete what cannot be made specific.
6. Emotion. Name the real frustration or desire. Use a concrete "before" picture, honestly.
7. Zero risk. Remove friction near the call to action. Address the unstated objection.

## Sentence and paragraph discipline
One idea per sentence, ideally under 25 words. Front-load the point. Vary length. Cut weak intensifiers (very, really, just, actually, basically). Use "use" not "utilize", "set up" not "implement", "help" not "facilitate". Prefer active voice.

## AI-tell scan
${AI_TELLS}

## Common fixes
Wall of features: add "which means". Corporate speak: say it how a person would. Weak opening: lead with the reader's problem. Buried call to action: make it obvious. No proof: add a real number or case, or cut the claim. Mixed audiences: choose one and write to them.`,
  },
  {
    id: "positioning-brand",
    title: "Positioning and brand strategy",
    whenToUse: "Defining or refining positioning, brand identity, messaging, voice, personas or competitor angles.",
    body: `# Positioning and brand strategy

Build one shared context document and reuse it everywhere. Sections to capture (conversationally, one at a time, validating each):
- Product overview: one-liner, what it is, category, business model.
- Target audience: company type and stage, decision-maker roles, the job they are hiring the product to do, concrete scenarios.
- B2B personas: user, champion, decision maker, financial buyer, technical influencer. For each: their challenge and what you promise them.
- Problems: the core challenge, why current alternatives fail, the cost in time, money and opportunity, the emotional tension.
- Competitive landscape: direct (same solution), secondary (different solution, same problem), indirect (a conflicting approach). Note the gap for each.
- Differentiation: what is genuinely different, how it solves the problem differently, and the benefit that follows.
- Objections and anti-personas: the top three objections with honest answers, and who is NOT a fit.
- Switching dynamics (the four forces): what pushes buyers off the old way, what pulls them to yours, the habit holding them, the anxiety about changing.
- Customer language: verbatim phrases for the problem and the solution, words to use and avoid.
- Brand voice: 3 to 5 adjectives, formality, and what it never sounds like.
- Proof points: metrics, logos, quotes, each tied to a value theme.
- Goals: the business goal and the conversion action.

## Brand identity and vision (what to write)
- Identity: mission in one sentence, audience, personality (3 to 5 traits with a "this, not that" for each), voice rules with before/after examples, vocabulary to use and avoid, visual direction in words.
- Vision: the world they want, the belief that drives the product, the 3-year picture, principles that guide trade-offs.
Always ground these in the blueprint and what the user has said. Mark gaps as "[NEED: ...]" and ask, instead of inventing facts.

## Positioning test
Can a stranger say who it is for, what it does, why it is different and why now, in two sentences? Is it unusable by any competitor word for word? If not, sharpen it.`,
  },
  {
    id: "persuasion",
    title: "Persuasion principles (ethical use)",
    whenToUse: "Choosing the angle, proof and ask for outreach or pages. Never to manipulate.",
    body: `# Persuasion principles for B2B copy

Use these to choose an angle, then write plainly. Never fake scarcity, invent social proof or pressure.
- Jobs to be done: frame the offer around the outcome the buyer is hiring for, not features.
- Reciprocity: give something useful first (an insight, a teardown, a number) before asking.
- Social proof and similarity: name peers who already use it, in the buyer's own segment, only when true.
- Authority: lead with a specific credential or result, not adjectives.
- Loss aversion: show what staying put costs, with a real figure.
- Contrast: make the problem state vivid before describing the fix.
- Status-quo bias and anxiety: make the first step small and reversible (a short look, a pilot, a yes/no).
- Hick's law and paradox of choice: one value proposition and one ask.
- Zeigarnik effect: an honest open loop ("found three gaps in how you...") that you then pay off.
- Pratfall effect: admitting a limitation honestly can raise trust.
- Mere exposure: several light, varied touches beat one long email.
- Local vs global optimum: if replies are low, fix targeting and the offer before polishing wording.
- Probabilistic thinking: vary the angle across recipients and keep what earns replies.`,
  },
];

export function getMarketingSkill(id: string): MarketingSkill | null {
  return MARKETING_SKILLS.find((s) => s.id === id) ?? null;
}

export function marketingSkillIndex() {
  return MARKETING_SKILLS.map(({ id, title, whenToUse }) => ({ id, title, whenToUse }));
}
