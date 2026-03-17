import React, { useState } from 'react';
import { Newspaper, RefreshCw, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { NewsItem } from '../../types';

interface Props {
  news: NewsItem[];
  onSync?: (items: NewsItem[]) => void;
}

export function NewsFeedWidget({ news, onSync }: Props) {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/news-sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Refresh will come through Supabase sync; trigger manual if callback provided
        if (onSync && data.count > 0) {
          // Re-fetch from Supabase
          const { data: newsData } = await supabase
            .from('user_data')
            .select('value')
            .eq('user_id', session.user.id)
            .eq('key', 'jarvis:news_feed')
            .maybeSingle();
          if (newsData?.value && Array.isArray(newsData.value)) {
            onSync(newsData.value as NewsItem[]);
          }
        }
      }
    } catch {
      // silently fail
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="caesar-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-[var(--text-muted)]" />
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Industry News
          </h3>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1 text-xs py-0.5 px-1.5 rounded transition-colors"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          title="Refresh news"
        >
          <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {news.length === 0 ? (
        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
          No news yet. Click refresh to fetch headlines.
        </p>
      ) : (
        <ul className="space-y-2">
          {news.slice(0, 5).map((item, i) => (
            <li key={i}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-2 text-xs rounded-lg px-2 py-1.5 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {item.title}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {item.source} · {item.publishedAt?.split('T')[0] ?? ''}
                  </p>
                </div>
                <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-60 mt-0.5" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
