/**
 * News API helpers — shared between api/news-sync.ts and inline briefing fetch.
 */

export interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary?: string;
}

export async function fetchNews(apiKey: string, queries: string[]): Promise<NewsItem[]> {
  const q = queries.length > 0 ? queries.join(' OR ') : 'AI startups tech';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=10&language=en`,
      {
        headers: { 'X-Api-Key': apiKey },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles ?? []).map((a: any) => ({
      title: a.title ?? '',
      source: a.source?.name ?? '',
      url: a.url ?? '',
      publishedAt: a.publishedAt ?? '',
      summary: a.description?.slice(0, 200) ?? undefined,
    }));
  } catch {
    clearTimeout(timeout);
    return [];
  }
}
