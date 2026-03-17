/**
 * Notion API helpers — shared between api/notion-sync.ts and inline briefing fetch.
 * Uses raw fetch instead of @notionhq/client to avoid adding a dependency.
 */

export interface NotionPageSummary {
  id: string;
  title: string;
  lastEditedAt: string;
  url: string;
  contentPreview?: string;
  database?: string;
}

async function notionFetch(path: string, token: string, method = 'POST', body?: any): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://api.notion.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return res.json();
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

function extractTitle(page: any): string {
  const props = page.properties ?? {};
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop.type === 'title' && Array.isArray(prop.title)) {
      return prop.title.map((t: any) => t.plain_text ?? '').join('');
    }
  }
  return 'Untitled';
}

export async function fetchNotionPages(token: string, databaseIds: string[]): Promise<NotionPageSummary[]> {
  const pages: NotionPageSummary[] = [];

  await Promise.all(databaseIds.map(async (dbId) => {
    const result = await notionFetch(`/databases/${dbId}/query`, token, 'POST', {
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      page_size: 10,
    });

    if (!result?.results) return;

    for (const page of result.results) {
      // Fetch first block for content preview
      const blocks = await notionFetch(`/blocks/${page.id}/children?page_size=3`, token, 'GET');
      let contentPreview = '';
      if (blocks?.results) {
        for (const block of blocks.results) {
          const texts = block[block.type]?.rich_text;
          if (Array.isArray(texts)) {
            contentPreview += texts.map((t: any) => t.plain_text ?? '').join('');
          }
        }
      }

      pages.push({
        id: page.id,
        title: extractTitle(page),
        lastEditedAt: page.last_edited_time ?? '',
        url: page.url ?? `https://notion.so/${page.id.replace(/-/g, '')}`,
        contentPreview: contentPreview.slice(0, 300) || undefined,
        database: dbId,
      });
    }
  }));

  return pages.sort((a, b) => b.lastEditedAt.localeCompare(a.lastEditedAt));
}
