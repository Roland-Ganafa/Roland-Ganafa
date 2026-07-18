// Ex-Files USSD flow, Africa's Talking compatible.
//
// Africa's Talking POSTs { sessionId, serviceCode, phoneNumber, text } and
// expects a plain-text reply beginning with:
//   CON  -> keep the session open, show a menu / prompt
//   END  -> terminate the session, show a final message
//
// `text` accumulates every input the user has typed this session, joined by "*".
// So "1*2*1" means: chose 1, then 2, then 1. We split it to know where we are.

import { redFlagIndex, REFERENCE_QUESTIONS, typeBeat } from './matcher.js';

const yn = (v) => (v === '1' ? true : false); // 1 = Yes, 2 = No

// The five self questions, then the five crush questions, one screen at a time.
const SELF_STEPS = REFERENCE_QUESTIONS.map((q) => `YOU: ${q.text}`);
const CRUSH_STEPS = REFERENCE_QUESTIONS.map((q) => `YOUR CRUSH: ${q.text}`);

/**
 * Pure USSD handler. Given the raw `text`, returns the string to send back.
 * Kept pure (no req/res) so it is trivially testable.
 */
export function handleUssd(text) {
  const parts = text === '' ? [] : text.split('*');

  // Level 0: main menu.
  if (parts.length === 0) {
    return [
      'CON Ex-Files 💘 Verify vibes before feelings.',
      '1. Run my Red Flag Index',
      '2. What is this?',
      '3. Flirt (locked 🔒)',
    ].join('\n');
  }

  const choice = parts[0];

  if (choice === '2') {
    return 'END Ex-Files checks who you SAY you are vs. who you say your crush is. #WeLoveNerds';
  }

  if (choice === '3') {
    return 'END Flirting unlocks only after your Red Flag Index. Rules are rules. Try 1. 🔒';
  }

  if (choice !== '1') {
    return 'END Invalid choice. The goat is disappointed. 🐐';
  }

  // Flow: parts[1..5] = self answers, parts[6..10] = crush answers.
  const answers = parts.slice(1); // everything after the "1" menu pick
  const totalNeeded = SELF_STEPS.length + CRUSH_STEPS.length; // 10

  if (answers.length < totalNeeded) {
    const idx = answers.length; // which question we are on now (0-based)
    const prompt = idx < SELF_STEPS.length
      ? SELF_STEPS[idx]
      : CRUSH_STEPS[idx - SELF_STEPS.length];
    return `CON ${prompt}\n1. Yes\n2. No`;
  }

  // We have all 10 answers. Build the two profiles.
  const selfRaw = answers.slice(0, 5);
  const crushRaw = answers.slice(5, 10);
  const keys = REFERENCE_QUESTIONS.map((q) => q.key);

  const self = {};
  const crush = {};
  keys.forEach((k, i) => {
    self[k] = yn(selfRaw[i]);
    crush[k] = yn(crushRaw[i]);
  });

  const { score, band, verdict } = redFlagIndex(self, crush);
  const beat = typeBeat(self, crush);

  return [
    `END Red Flag Index: ${score}/100 (${band})`,
    verdict,
    '',
    beat,
    '',
    'Flirting unlocked. The goat wishes you luck. 🐐',
  ].join('\n');
}
