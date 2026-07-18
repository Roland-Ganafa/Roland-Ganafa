// Ex-Files matching engine.
// Two entirely serious algorithms: the Red Flag Index and the Vibe Score.
// (They are not serious. But they run.)

// The Ex-Files Reference Check questions. Users answer these about THEMSELVES,
// then answer the same questions about their most recent ex. The gap between
// the two answers is where the truth (and the comedy) lives.
export const REFERENCE_QUESTIONS = [
  { key: 'available', text: 'Emotionally available?' },
  { key: 'replies', text: 'Replies to texts within a day?' },
  { key: 'plans', text: 'Actually shows up to plans?' },
  { key: 'closure', text: 'Believes in closure?' },
  { key: 'redflags', text: 'Owns exactly zero red flags?' },
];

// Clamp helper.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Red Flag Index.
 * self:  { available: bool, replies: bool, ... } — what you say about you.
 * ex:    the same shape — what you say about your ex.
 *
 * The theory: the way you describe your ex is a confession about the
 * relationships you keep choosing. Every "my ex was NOT available / did NOT
 * reply / did NOT show up" is a red flag you signed up for on purpose.
 * We also lightly tax people who claim to have zero red flags themselves,
 * because that is, statistically, the biggest red flag of all.
 *
 * @returns {{score:number, band:string, verdict:string, flags:string[]}}
 */
export function redFlagIndex(self, ex) {
  const flags = [];
  let score = 0;

  // Each negative trait you assign to your ex is worth 15 points.
  const exBurns = {
    available: 'Chose someone emotionally unavailable (on purpose).',
    replies: 'Dated a professional ghost.',
    plans: 'Kept saying yes to a serial no-show.',
    closure: 'Left the relationship on read.',
  };
  for (const [key, msg] of Object.entries(exBurns)) {
    if (ex[key] === false) {
      score += 15;
      flags.push(msg);
    }
  }

  // Claiming YOU own zero red flags: +25. The confidence is the flag.
  if (self.redflags === true) {
    score += 25;
    flags.push('Claims to have zero red flags. Bold. Suspicious.');
  }

  // Admitting you are not emotionally available: honest, but noted. +10.
  if (self.available === false) {
    score += 10;
    flags.push('Self-reported: not emotionally available (at least you said it).');
  }

  score = clamp(score, 0, 100);

  let band, verdict;
  if (score <= 20) {
    band = 'Green';
    verdict = 'Suspiciously well-adjusted. Proceed, cautiously charmed.';
  } else if (score <= 50) {
    band = 'Amber';
    verdict = 'A normal amount of baggage. Carry-on size. Approved for boarding.';
  } else if (score <= 75) {
    band = 'Red';
    verdict = 'Checked luggage. Bring a friend to the first date.';
  } else {
    band = 'Crimson';
    verdict = 'Full moving truck. We admire the commitment to chaos.';
  }

  return { score, band, verdict, flags };
}

/**
 * Vibe Score between two profiles.
 * A profile is { name, answers: {available, replies, plans, closure, redflags} }.
 * Compatibility rewards matching honesty, not matching perfection.
 *
 * @returns {{score:number, verdict:string, notes:string[]}}
 */
export function vibeScore(a, b) {
  const notes = [];
  let score = 50; // everyone starts at "eh, maybe".

  const A = a.answers || {};
  const B = b.answers || {};

  for (const q of REFERENCE_QUESTIONS) {
    const same = A[q.key] === B[q.key];
    if (same) {
      score += 8;
    } else {
      score -= 6;
    }
  }

  // Two people who both admit they're not emotionally available are, ironically,
  // extremely compatible. They will make each other's therapists rich together.
  if (A.available === false && B.available === false) {
    score += 12;
    notes.push('Mutually unavailable. A beautiful, doomed symmetry.');
  }

  // Two "zero red flags" people is a head-on collision of egos.
  if (A.redflags === true && B.redflags === true) {
    score -= 15;
    notes.push('Two flawless people. This will end in a documentary.');
  }

  // Both reply to texts: rare, precious, protect it.
  if (A.replies === true && B.replies === true) {
    score += 10;
    notes.push('Both actually reply. Marry immediately.');
  }

  score = clamp(Math.round(score), 0, 100);

  let verdict;
  if (score >= 80) verdict = 'Dangerously compatible. The goat approves. 🐐';
  else if (score >= 60) verdict = 'Real potential. Worth a USSD hello.';
  else if (score >= 40) verdict = 'Chemistry unclear. Consult the goat.';
  else verdict = 'The Awkward Silence Timer is already warming up.';

  return { score, verdict, notes };
}

// The Type Beat Detector: what you claim vs. what you keep choosing.
export function typeBeat(self, ex) {
  const claimed = self.available ? 'ambitious and available' : 'a work in progress';
  const actual = ex.available === false ? 'emotionally unavailable' : 'genuinely available';
  return `You say your type is "${claimed}." Based on your ex, your type is actually "${actual}." Matched accordingly.`;
}
