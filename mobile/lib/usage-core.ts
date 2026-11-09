// SIRA's own on/off for the phone's position and microphone. The phone's permission says whether SIRA *may*
// use them (only the phone's settings can take it back); this says whether SIRA *does*. Off: SIRA leaves
// them alone even if the phone allows them. Pure rules, tested with Node (npm test); storage in lib/usage.ts.

export type UsageKind = 'location' | 'microphone';
export type Usage = Record<UsageKind, boolean>;

// Both on by default: the phone's own question already asked the traveller.
export const DEFAULT_USAGE: Usage = { location: true, microphone: true };

export const USAGE_OFF_MESSAGES: Record<UsageKind, string> = {
  location: 'Tu as coupé la position dans SIRA (Profil > Autorisations) : choisis ton départ toi-même.',
  microphone: 'Tu as coupé le micro dans SIRA (Profil > Autorisations) : écris ta question.',
};

// What was stored, or the defaults; only true/false values are kept.
export function parseUsage(text: string | null | undefined): Usage {
  if (!text) return { ...DEFAULT_USAGE };
  try {
    const raw = JSON.parse(text) as Partial<Record<UsageKind, unknown>>;
    return {
      location: typeof raw?.location === 'boolean' ? raw.location : DEFAULT_USAGE.location,
      microphone: typeof raw?.microphone === 'boolean' ? raw.microphone : DEFAULT_USAGE.microphone,
    };
  } catch {
    return { ...DEFAULT_USAGE };
  }
}
