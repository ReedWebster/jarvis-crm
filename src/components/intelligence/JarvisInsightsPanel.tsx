import React, { useState, useMemo, useCallback } from 'react';
import {
  Sparkles, X, ChevronRight, Clock, Users, Target,
  DollarSign, BookOpen, CheckSquare, Activity, Zap,
  ChevronDown, ChevronUp, Bell,
} from 'lucide-react';
import type { Insight, InsightCategory, InsightPriority, AppDataSnapshot } from '../../utils/intelligence';
import { computeInsights } from '../../utils/intelligence';
import type { NavSection } from '../layout/Sidebar';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  data: AppDataSnapshot;
  onNavigate: (section: NavSection) => void;
  onRequestNotificationPermission?: () => void;
  externalOpen?: boolean;
  onExternalOpenChange?: (v: boolean) => void;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function categoryIcon(cat: InsightCategory) {
  switch (cat) {
    case 'time':       return <Clock className="w-4 h-4" />;
    case 'contact':    return <Users className="w-4 h-4" />;
    case 'goal':       return <Target className="w-4 h-4" />;
    case 'financial':  return <DollarSign className="w-4 h-4" />;
    case 'todo':       return <CheckSquare className="w-4 h-4" />;
    case 'reading':    return <BookOpen className="w-4 h-4" />;
    case 'habit':      return <Activity className="w-4 h-4" />;
    case 'wellness':   return <Zap className="w-4 h-4" />;
  }
}

function priorityColor(priority: InsightPriority): string {
  switch (priority) {
    case 'urgent': return '#ef4444';
    case 'high':   return '#f97316';
    case 'medium': return '#eab308';
    case 'low':    return '#6b7280';
  }
}

function priorityLabel(priority: InsightPriority): string {
  switch (priority) {
    case 'urgent': return 'Urgent';
    case 'high':   return 'High';
    case 'medium': return 'Medium';
    case 'low':    return 'Low';
  }
}

// ─── INSIGHT CARD ─────────────────────────────────────────────────────────────

function InsightCard({
  insight,
  onNavigate,
  onDismiss,
}: {
  insight: Insight;
  onNavigate: (section: NavSection) => void;
  onDismiss: (id: string) => void;
}) {
  const color = priorityColor(insight.priority);

  return (
    <div
      className="rounded-lg p-3 flex gap-3 items-start group relative"
      style={{
        backgroundColor: 'var(--bg)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${color}`,
      }}
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {categoryIcon(insight.category)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <p className="text-xs font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
            {insight.title}
          </p>
          <button
            onClick={() => onDismiss(insight.id)}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--border)]"
            title="Dismiss"
          >
            <X className="w-3 h-3 text-[var(--text-muted)]" />
          </button>
        </div>
        <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
          {insight.description}
        </p>
        {insight.navTarget && (
          <button
            onClick={() => onNavigate(insight.navTarget as NavSection)}
            className="mt-1.5 flex items-center gap-0.5 text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color }}
          >
            View <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Priority dot */}
      <div
        className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5"
        style={{ backgroundColor: color }}
        title={priorityLabel(insight.priority)}
      />
    </div>
  );
}

// ─── MAIN PANEL ──────────────────────────────────────────────────────────────

export function JarvisInsightsPanel({ data, onNavigate, onRequestNotificationPermission, externalOpen, onExternalOpenChange }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onExternalOpenChange?.(v);
  };
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const allInsights = useMemo(() => computeInsights(data), [data]);

  const visible = useMemo(
    () => allInsights.filter(i => !dismissed.has(i.id)),
    [allInsights, dismissed],
  );

  const displayed = showAll ? visible : visible.slice(0, 5);
  const urgentCount = visible.filter(i => i.priority === 'urgent' || i.priority === 'high').length;

  const handleDismiss = useCallback((id: string) => {
    setDismissed(prev => new Set([...prev, id]));
  }, []);

  const handleNavigate = useCallback((section: NavSection) => {
    onNavigate(section);
    setOpen(false);
  }, [onNavigate]);

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
        }}
        title="J.A.R.V.I.S. Insights"
      >
        <Sparkles className="w-5 h-5 text-white" />
        {urgentCount > 0 && (
          <span
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
            style={{ backgroundColor: '#ef4444' }}
          >
            {urgentCount > 9 ? '9+' : urgentCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-20 right-6 z-40 w-80 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            maxHeight: '70vh',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: '#6366f1' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                J.A.R.V.I.S. Insights
              </span>
              {visible.length > 0 && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  {visible.length}
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-[var(--border)] transition-colors"
            >
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Enable notifications banner */}
          {onRequestNotificationPermission &&
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'default' && (
            <div
              className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'rgba(99,102,241,0.06)' }}
            >
              <Bell className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#6366f1' }} />
              <p className="text-xs flex-1" style={{ color: 'var(--text-muted)' }}>
                Get OS notifications for urgent items
              </p>
              <button
                onClick={onRequestNotificationPermission}
                className="text-xs font-semibold px-2 py-1 rounded-md flex-shrink-0"
                style={{ backgroundColor: '#6366f1', color: '#fff' }}
              >
                Enable
              </button>
            </div>
          )}

          {/* Insights list */}
          <div className="overflow-y-auto flex-1 p-3 space-y-2">
            {visible.length === 0 ? (
              <div className="text-center py-8">
                <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-30" style={{ color: '#6366f1' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  All clear!
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  No outstanding insights right now.
                </p>
              </div>
            ) : (
              <>
                {displayed.map(insight => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    onNavigate={handleNavigate}
                    onDismiss={handleDismiss}
                  />
                ))}
                {visible.length > 5 && (
                  <button
                    onClick={() => setShowAll(v => !v)}
                    className="w-full flex items-center justify-center gap-1 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-[var(--border)]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {showAll ? (
                      <><ChevronUp className="w-3 h-3" /> Show less</>
                    ) : (
                      <><ChevronDown className="w-3 h-3" /> {visible.length - 5} more insights</>
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {dismissed.size > 0 && (
            <div
              className="px-4 py-2 flex-shrink-0 flex items-center justify-end"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <button
                onClick={() => setDismissed(new Set())}
                className="text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                Restore {dismissed.size} dismissed
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
