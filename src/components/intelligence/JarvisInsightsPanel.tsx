import React, { useState, useMemo, useCallback } from 'react';
import {
  Sparkles, X, ChevronRight, Clock, Users, Target,
  DollarSign, BookOpen, CheckSquare, Activity, Zap,
  ChevronDown, ChevronUp, Bell, Filter,
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
  dismissedInsightIds: string[];
  onDismissInsight: (id: string) => void;
  onRestoreDismissed: () => void;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<InsightCategory, { label: string; icon: React.ReactNode; color: string }> = {
  time:      { label: 'Time',      icon: <Clock className="w-4 h-4" />,       color: '#3b82f6' },
  contact:   { label: 'Contacts',  icon: <Users className="w-4 h-4" />,       color: '#8b5cf6' },
  goal:      { label: 'Goals',     icon: <Target className="w-4 h-4" />,      color: '#f97316' },
  financial: { label: 'Financial', icon: <DollarSign className="w-4 h-4" />,  color: '#22c55e' },
  todo:      { label: 'Tasks',     icon: <CheckSquare className="w-4 h-4" />, color: '#ef4444' },
  reading:   { label: 'Reading',   icon: <BookOpen className="w-4 h-4" />,    color: '#06b6d4' },
  habit:     { label: 'Habits',    icon: <Activity className="w-4 h-4" />,    color: '#eab308' },
  wellness:  { label: 'Wellness',  icon: <Zap className="w-4 h-4" />,        color: '#ec4899' },
};

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
  const catMeta = CATEGORY_META[insight.category];

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
        style={{ backgroundColor: `${catMeta.color}20`, color: catMeta.color }}
      >
        {catMeta.icon}
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

export function JarvisInsightsPanel({
  data,
  onNavigate,
  onRequestNotificationPermission,
  externalOpen,
  onExternalOpenChange,
  dismissedInsightIds,
  onDismissInsight,
  onRestoreDismissed,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onExternalOpenChange?.(v);
  };
  const [showAll, setShowAll] = useState(false);
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [filterCategory, setFilterCategory] = useState<InsightCategory | null>(null);

  const allInsights = useMemo(() => computeInsights(data), [data]);

  const dismissedSet = useMemo(() => new Set(dismissedInsightIds), [dismissedInsightIds]);

  const visible = useMemo(
    () => allInsights.filter(i => !dismissedSet.has(i.id)),
    [allInsights, dismissedSet],
  );

  const filtered = useMemo(
    () => filterCategory ? visible.filter(i => i.category === filterCategory) : visible,
    [visible, filterCategory],
  );

  const displayed = showAll ? filtered : filtered.slice(0, 5);
  const urgentCount = visible.filter(i => i.priority === 'urgent' || i.priority === 'high').length;

  // Group insights by category
  const grouped = useMemo(() => {
    if (!groupByCategory) return null;
    const groups: Partial<Record<InsightCategory, Insight[]>> = {};
    for (const i of filtered) {
      if (!groups[i.category]) groups[i.category] = [];
      groups[i.category]!.push(i);
    }
    return groups;
  }, [filtered, groupByCategory]);

  const handleDismiss = useCallback((id: string) => {
    onDismissInsight(id);
  }, [onDismissInsight]);

  const handleNavigate = useCallback((section: NavSection) => {
    onNavigate(section);
    setOpen(false);
  }, [onNavigate]);

  // Category counts for filter bar
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<InsightCategory, number>> = {};
    for (const i of visible) {
      counts[i.category] = (counts[i.category] ?? 0) + 1;
    }
    return counts;
  }, [visible]);

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
          className="fixed bottom-20 right-6 z-40 w-96 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            maxHeight: '75vh',
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
            <div className="flex items-center gap-1">
              <button
                onClick={() => setGroupByCategory(!groupByCategory)}
                className={`p-1 rounded transition-colors ${groupByCategory ? 'bg-[var(--border)]' : 'hover:bg-[var(--border)]'}`}
                title={groupByCategory ? 'Show flat list' : 'Group by category'}
              >
                <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-[var(--border)] transition-colors"
              >
                <X className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            </div>
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

          {/* Category filter chips */}
          {visible.length > 0 && (
            <div
              className="flex gap-1.5 px-4 py-2 overflow-x-auto flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <button
                onClick={() => setFilterCategory(null)}
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-colors ${
                  !filterCategory ? 'bg-[var(--border)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--border)]'
                }`}
              >
                All ({visible.length})
              </button>
              {(Object.entries(categoryCounts) as [InsightCategory, number][]).map(([cat, count]) => {
                const meta = CATEGORY_META[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-colors ${
                      filterCategory === cat ? 'text-white' : 'text-[var(--text-muted)] hover:bg-[var(--border)]'
                    }`}
                    style={filterCategory === cat ? { backgroundColor: `${meta.color}40`, color: meta.color } : undefined}
                  >
                    {meta.label} ({count})
                  </button>
                );
              })}
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
            ) : groupByCategory && grouped ? (
              // Grouped view
              <>
                {(Object.entries(grouped) as [InsightCategory, Insight[]][]).map(([cat, catInsights]) => {
                  const meta = CATEGORY_META[cat];
                  return (
                    <div key={cat}>
                      <div className="flex items-center gap-1.5 mb-1.5 px-1">
                        <div
                          className="w-4 h-4 rounded flex items-center justify-center"
                          style={{ color: meta.color }}
                        >
                          {meta.icon}
                        </div>
                        <span className="text-xs font-semibold" style={{ color: meta.color }}>
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">({catInsights.length})</span>
                      </div>
                      <div className="space-y-1.5 mb-3">
                        {catInsights.map(insight => (
                          <InsightCard
                            key={insight.id}
                            insight={insight}
                            onNavigate={handleNavigate}
                            onDismiss={handleDismiss}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              // Flat view
              <>
                {displayed.map(insight => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    onNavigate={handleNavigate}
                    onDismiss={handleDismiss}
                  />
                ))}
                {filtered.length > 5 && (
                  <button
                    onClick={() => setShowAll(v => !v)}
                    className="w-full flex items-center justify-center gap-1 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-[var(--border)]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {showAll ? (
                      <><ChevronUp className="w-3 h-3" /> Show less</>
                    ) : (
                      <><ChevronDown className="w-3 h-3" /> {filtered.length - 5} more insights</>
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {dismissedInsightIds.length > 0 && (
            <div
              className="px-4 py-2 flex-shrink-0 flex items-center justify-end"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <button
                onClick={onRestoreDismissed}
                className="text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                Restore {dismissedInsightIds.length} dismissed
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
