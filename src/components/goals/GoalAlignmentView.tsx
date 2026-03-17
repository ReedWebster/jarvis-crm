import React, { useMemo } from 'react';
import { Target } from 'lucide-react';
import type { Goal, TimeBlock, TimeCategory } from '../../types';
import { checkGoalCalendarAlignment } from '../../utils/intelligence';

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface Props {
  goals: Goal[];
  timeBlocks: TimeBlock[];
  timeCategories: TimeCategory[];
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function alignmentDot(alignment: 'good' | 'low' | 'none'): string {
  switch (alignment) {
    case 'good': return '#22c55e';
    case 'low':  return '#eab308';
    case 'none': return '#ef4444';
  }
}

function alignmentLabel(alignment: 'good' | 'low' | 'none'): string {
  switch (alignment) {
    case 'good': return 'On track';
    case 'low':  return 'Low';
    case 'none': return 'No time logged';
  }
}

// ─── COMPONENT ──────────────────────────────────────────────────────────────

export function GoalAlignmentView({ goals, timeBlocks, timeCategories }: Props) {
  const entries = useMemo(
    () => checkGoalCalendarAlignment(goals, timeBlocks, timeCategories),
    [goals, timeBlocks, timeCategories],
  );

  return (
    <div className="caesar-card flex flex-col gap-4" style={{ padding: 20 }}>
      {/* Header */}
      <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <Target className="w-5 h-5" />
        <h3 className="text-base font-semibold" style={{ margin: 0 }}>
          Goal-Calendar Alignment
        </h3>
      </div>

      {entries.length === 0 ? (
        <div
          className="text-sm text-center py-8"
          style={{ color: 'var(--text-muted)' }}
        >
          No active goals to evaluate.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(entry => (
            <div
              key={entry.goalTitle}
              className="flex items-center gap-3"
              style={{
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {/* Alignment dot */}
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: alignmentDot(entry.alignment),
                  flexShrink: 0,
                }}
              />

              {/* Goal title + area */}
              <div className="flex flex-col" style={{ flex: 1, minWidth: 0 }}>
                <span
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {entry.goalTitle}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {entry.area}
                </span>
              </div>

              {/* Hours this week */}
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}
              >
                {entry.hoursThisWeek}h
              </span>

              {/* Alignment label */}
              <span
                className="text-xs"
                style={{
                  color: alignmentDot(entry.alignment),
                  minWidth: 90,
                  textAlign: 'right',
                }}
              >
                {alignmentLabel(entry.alignment)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
