// What this phone already said about each traffic report: the reports it sent, and its « Toujours là »
// or « Plus là ». The server takes one opinion per traveller (the author counts as one); remembering it
// here, the report's window shows that opinion instead of buttons the server would refuse.

// author: sent from this phone. known: the server says an opinion exists, given elsewhere or before
// this memory existed, without saying which.
export type Opinion = 'author' | 'confirm' | 'contest' | 'known';
export type OpinionRecord = { reportId: string; opinion: Opinion; at: number };

// A report lives a few hours at most: two days of memory is plenty (my choice), and a bound on size.
export const KEEP_MS = 48 * 3600_000;
export const MAX_OPINIONS = 300;

const OPINIONS: Opinion[] = ['author', 'confirm', 'contest', 'known'];

const fresh = (list: OpinionRecord[], now: number) =>
  list.filter((item) => now - item.at < KEEP_MS).slice(0, MAX_OPINIONS);

export function opinionFor(list: OpinionRecord[], reportId: string): Opinion | null {
  return list.find((item) => item.reportId === reportId)?.opinion ?? null;
}

// Newest first. Being the author is never replaced: it says more than « already given ».
export function rememberOpinion(list: OpinionRecord[], reportId: string, opinion: Opinion, now = Date.now()): OpinionRecord[] {
  const current = opinionFor(list, reportId);
  if (current === 'author' || (current && opinion === 'known')) return fresh(list, now);
  return fresh([{ reportId, opinion, at: now }, ...list.filter((item) => item.reportId !== reportId)], now);
}

export function parseStoredOpinions(text: string | null | undefined, now = Date.now()): OpinionRecord[] {
  if (!text) return [];
  try {
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    return fresh(data.filter((item): item is OpinionRecord =>
      typeof item?.reportId === 'string' && OPINIONS.includes(item?.opinion) && Number.isFinite(item?.at)), now);
  } catch {
    return [];
  }
}

// What the report's window says in place of the buttons.
export const OPINION_LABEL: Record<Opinion, string> = {
  author: 'Tu as signalé cet événement',
  confirm: 'Ton avis : toujours là',
  contest: 'Ton avis : plus là',
  known: 'Ton avis est déjà enregistré',
};

// « 1 confirmation », « 2 confirmations ».
export const confirmationsLabel = (count: number) => `${count} confirmation${count > 1 ? 's' : ''}`;
