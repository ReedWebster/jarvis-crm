import React from 'react';
import { Mail, X, Check } from 'lucide-react';
import type { EmailDraft } from '../../types';

interface Props {
  drafts: EmailDraft[];
  setDrafts: (v: EmailDraft[] | ((p: EmailDraft[]) => EmailDraft[])) => void;
}

export function EmailDraftsReview({ drafts, setDrafts }: Props) {
  const pending = drafts.filter(d => d.status === 'pending');
  if (pending.length === 0) return null;

  const dismiss = (id: string) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: 'dismissed' as const } : d));
  };

  const approve = (id: string) => {
    // For now, mark as sent (actual send would require a backend call)
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: 'sent' as const } : d));
  };

  return (
    <div className="caesar-card space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-[var(--text-muted)]" />
        <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          AI Email Drafts ({pending.length})
        </h3>
      </div>

      <div className="space-y-2">
        {pending.map(draft => (
          <div
            key={draft.id}
            className="rounded-lg p-3 space-y-1.5"
            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                To: {draft.to}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => approve(draft.id)}
                  className="p-1 rounded transition-colors hover:bg-[var(--bg-card)]"
                  title="Approve & send"
                >
                  <Check className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                </button>
                <button
                  onClick={() => dismiss(draft.id)}
                  className="p-1 rounded transition-colors hover:bg-[var(--bg-card)]"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
            </div>
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {draft.subject}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {draft.body.slice(0, 200)}{draft.body.length > 200 ? '...' : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
