const AGGRESSIVE_WORDS = [
  'idiot',
  'stupid',
  'hate',
  'kill',
  'fuck',
  'scam',
  'fraud',
  'chargeback',
  'refund',
  'paypal',
  'nitro',
  'steam',
  'crypto',
  'bastard',
  'cuxxl',
  
];

export function analyzePriority(input: { text: string; recentTickets: number; repeatedReports: number }) {
  const text = input.text.toLowerCase();
  const hits = AGGRESSIVE_WORDS.filter((w) => text.includes(w));
  const reasons: string[] = [];

  if (input.recentTickets >= 3) reasons.push('High ticket volume in 24h');
  if (input.repeatedReports >= 2) reasons.push('Repeated reports on same target');
  if (hits.length) reasons.push(`Flagged keywords: ${hits.slice(0, 4).join(', ')}`);

  const priority = reasons.length ? 'HIGH' : 'NORMAL';
  return { priority, reason: reasons.join(' - ') || null };
}

const TEMPLATE_SUGGESTIONS: { keyword: string; suggestion: string }[] = [
  {
    keyword: 'banned',
    suggestion: 'Provide ban-appeal steps and request context (username, reason, appeal notes).',
  },
  {
    keyword: 'refund',
    suggestion: 'Ask for order ID, payment method, and transaction date.',
  },
  {
    keyword: 'chargeback',
    suggestion: 'Request evidence and explain chargeback policy.',
  },
  {
    keyword: 'scam',
    suggestion: 'Ask for screenshots, user IDs, and transaction links.',
  },
];

export function getSuggestionsFromText(text: string) {
  const lower = text.toLowerCase();
  return TEMPLATE_SUGGESTIONS.filter((t) => lower.includes(t.keyword)).map((t) => t.suggestion);
}


export function findAggressiveWords(text: string) {
  const lower = text.toLowerCase();
  return AGGRESSIVE_WORDS.filter((w) => lower.includes(w));
}
