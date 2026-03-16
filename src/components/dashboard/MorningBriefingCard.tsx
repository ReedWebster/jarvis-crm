import React, { useState, useCallback } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Target,
  Users,
  Lightbulb,
  RefreshCw,
  Clock,
  Mail,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { MorningBriefing } from '../../types';

interface Props {
  briefing: MorningBriefing | null;
  onRefresh: (newBriefing: MorningBriefing) => void;
}

export default function MorningBriefingCard({ briefing, onRefresh }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not logged in — please sign in first.');
        return;
      }
      const res = await fetch('/api/morning-briefing', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.googleStatus) console.log('[Briefing] Google status:', data.googleStatus);
        if (data.briefing) onRefresh(data.briefing);
        else setError('Empty response from server.');
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Server error (${res.status})`);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Network error — check your connection.');
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  if (!briefing) {
    return (
      <div className="caesar-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--text-muted)]" />
            <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Morning Briefing
            </h3>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs py-1 px-2.5 rounded-lg transition-colors"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Generating...' : 'Generate Briefing'}
          </button>
        </div>
        {error && (
          <p className="text-xs font-medium" style={{ color: 'var(--priority-high, #ef4444)' }}>
            {error}
          </p>
        )}
        <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>
          No briefing yet. Click "Generate Briefing" to create your first one.
        </p>
      </div>
    );
  }

  const { sections } = briefing;
  const generatedTime = new Date(briefing.generatedAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  const priorityColors: Record<string, string> = {
    high: 'var(--priority-high, #ef4444)',
    medium: 'var(--priority-medium, #f59e0b)',
    low: 'var(--priority-low, #6b7280)',
  };

  return (
    <div className="caesar-card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-2 group"
        >
          <Sparkles className="w-5 h-5 text-[var(--text-muted)]" />
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Morning Briefing
          </h3>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)] opacity-50 group-hover:opacity-100 transition-opacity" />
            : <ChevronDown className="w-4 h-4 text-[var(--text-muted)] opacity-50 group-hover:opacity-100 transition-opacity" />
          }
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <Clock className="w-3 h-3 inline mr-1" />
            {generatedTime}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 text-xs py-0.5 px-1.5 rounded transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            title="Refresh briefing"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 animate-fade-in">
          {/* Executive Summary */}
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {sections.executiveSummary}
          </p>

          {/* Priority Tasks */}
          {sections.priorityTasks?.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Priority Tasks
                </h4>
              </div>
              <ul className="space-y-1.5">
                {sections.priorityTasks.map((task, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: priorityColors[task.priority] ?? priorityColors.medium }}
                    />
                    <div className="min-w-0">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {task.title}
                      </span>
                      <span className="text-xs ml-1.5" style={{ color: 'var(--text-muted)' }}>
                        — {task.reasoning}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Goals Check-in */}
          {sections.goalsCheckIn?.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Goals Check-in
              </h4>
              <div className="space-y-1.5">
                {sections.goalsCheckIn.map((goal, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {goal.title}
                        </span>
                        <span className="text-xs flex-shrink-0 ml-2" style={{ color: 'var(--text-muted)' }}>
                          {goal.progress}%
                        </span>
                      </div>
                      <div className="w-full rounded-full h-1" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                        <div
                          className="h-1 rounded-full transition-all"
                          style={{
                            width: `${goal.progress}%`,
                            backgroundColor: goal.progress >= 75 ? 'var(--text-secondary)' : goal.progress >= 40 ? 'var(--text-muted)' : 'var(--priority-high, #ef4444)',
                          }}
                        />
                      </div>
                      {goal.note && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{goal.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contact Follow-ups */}
          {sections.contactFollowUps?.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Reach Out To
                </h4>
              </div>
              <ul className="space-y-1">
                {sections.contactFollowUps.map((c, i) => (
                  <li key={i} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                    {' — '}{c.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Email Digest */}
          {sections.emailDigest?.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Email Digest
                </h4>
              </div>
              <ul className="space-y-1.5">
                {sections.emailDigest.map((email, i) => (
                  <li key={i} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-medium" style={{ color: email.urgent ? 'var(--priority-high, #ef4444)' : 'var(--text-primary)' }}>
                      {email.subject}
                    </span>
                    <span className="ml-1" style={{ color: 'var(--text-muted)' }}>from {email.from}</span>
                    {email.summary && (
                      <p className="mt-0.5" style={{ color: 'var(--text-muted)' }}>{email.summary}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Strategic Notes */}
          {sections.strategicNotes?.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Strategic Notes
                </h4>
              </div>
              <ul className="space-y-1">
                {sections.strategicNotes.map((note, i) => (
                  <li key={i} className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Connect Google prompt — only show if no email AND no calendar data */}
          {(!sections.emailDigest || sections.emailDigest.length === 0) &&
           (!sections.calendar || sections.calendar.length === 0) && (
            <div
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Connect Google to include Gmail + Calendar in your briefing
              </span>
              <a
                href="/api/oauth-start?provider=google"
                className="text-xs font-medium py-0.5 px-2 rounded transition-colors"
                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Connect
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
