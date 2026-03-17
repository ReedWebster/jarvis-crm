/**
 * Readwise API helpers — shared between api/readwise-sync.ts and inline briefing fetch.
 */

export interface ReadwiseHighlight {
  id: string;
  text: string;
  bookTitle: string;
  author: string;
  highlightedAt: string;
  note?: string;
}

export async function fetchReadwiseHighlights(token: string): Promise<ReadwiseHighlight[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://readwise.io/api/v2/highlights/?page_size=50&highlighted_at__gt=${sevenDaysAgo}`,
      {
        headers: { Authorization: `Token ${token}` },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).map((h: any) => ({
      id: String(h.id ?? ''),
      text: h.text ?? '',
      bookTitle: h.book_title ?? h.title ?? '',
      author: h.book_author ?? h.author ?? '',
      highlightedAt: h.highlighted_at ?? '',
      note: h.note || undefined,
    }));
  } catch {
    clearTimeout(timeout);
    return [];
  }
}
