import React, { useMemo } from 'react';
import { Users, AlertTriangle } from 'lucide-react';
import type { Contact } from '../../types';
import { scoreContactRelationship } from '../../utils/intelligence';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface Props {
  contacts: Contact[];
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}

function daysSince(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  try {
    return differenceInDays(startOfDay(new Date()), startOfDay(parseISO(dateStr)));
  } catch {
    return null;
  }
}

// ─── COMPONENT ──────────────────────────────────────────────────────────────

export function RelationshipScorecard({ contacts }: Props) {
  const scored = useMemo(() => {
    return contacts
      .map(contact => ({
        contact,
        score: scoreContactRelationship(contact, contact.interactions ?? []),
        daysSinceContact: daysSince(contact.lastContacted),
      }))
      .sort((a, b) => a.score - b.score);
  }, [contacts]);

  return (
    <div className="caesar-card flex flex-col gap-4" style={{ padding: 20 }}>
      {/* Header */}
      <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <Users className="w-5 h-5" />
        <h3 className="text-base font-semibold" style={{ margin: 0 }}>
          Relationship Health
        </h3>
      </div>

      {scored.length === 0 ? (
        <div
          className="text-sm text-center py-8"
          style={{ color: 'var(--text-muted)' }}
        >
          No contacts to display.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {scored.map(({ contact, score, daysSinceContact }) => (
            <div
              key={contact.id}
              className="flex items-center gap-3"
              style={{
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {/* Name */}
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)', minWidth: 100, flex: '0 0 auto' }}
              >
                {contact.name}
              </span>

              {/* Score bar */}
              <div
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 4,
                  background: 'var(--border)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${score}%`,
                    height: '100%',
                    borderRadius: 4,
                    background: scoreColor(score),
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>

              {/* Score number */}
              <span
                className="text-xs font-medium"
                style={{ color: scoreColor(score), minWidth: 28, textAlign: 'right' }}
              >
                {score}
              </span>

              {/* Days since contact */}
              <span
                className="text-xs"
                style={{ color: 'var(--text-muted)', minWidth: 50, textAlign: 'right' }}
              >
                {daysSinceContact !== null ? `${daysSinceContact}d ago` : '—'}
              </span>

              {/* At risk badge */}
              {score < 30 && (
                <span
                  className="text-xs font-medium flex items-center gap-1"
                  style={{
                    color: '#ef4444',
                    background: 'rgba(239,68,68,0.1)',
                    padding: '2px 8px',
                    borderRadius: 9999,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <AlertTriangle className="w-3 h-3" />
                  at risk
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
