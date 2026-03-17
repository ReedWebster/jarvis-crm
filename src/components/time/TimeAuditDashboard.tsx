import React, { useMemo } from 'react';
import { Clock, BarChart2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TimeBlock, TimeCategory } from '../../types';
import { computeTimeAudit } from '../../utils/intelligence';

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface Props {
  timeBlocks: TimeBlock[];
  timeCategories: TimeCategory[];
}

// ─── COMPONENT ──────────────────────────────────────────────────────────────

export function TimeAuditDashboard({ timeBlocks, timeCategories }: Props) {
  const audit = useMemo(
    () => computeTimeAudit(timeBlocks, timeCategories, 7),
    [timeBlocks, timeCategories],
  );

  const chartData = useMemo(() => {
    return Object.entries(audit.byCategory)
      .map(([id, data]) => ({
        name: data.name,
        hours: Math.round(data.hours * 10) / 10,
        fill: data.color,
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [audit]);

  return (
    <div className="caesar-card flex flex-col gap-4" style={{ padding: 20 }}>
      {/* Header */}
      <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <BarChart2 className="w-5 h-5" />
        <h3 className="text-base font-semibold" style={{ margin: 0 }}>
          Weekly Time Audit
        </h3>
        <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
          {audit.totalHours.toFixed(1)}h total
        </span>
      </div>

      {/* Bar Chart */}
      {chartData.length > 0 ? (
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 12 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--text-primary)',
                }}
                formatter={(value: number) => [`${value}h`, 'Hours']}
              />
              <Bar dataKey="hours" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          className="text-sm text-center py-8"
          style={{ color: 'var(--text-muted)' }}
        >
          No time blocks logged this week.
        </div>
      )}

      {/* Category Table */}
      {chartData.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 500 }}>Category</th>
              <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 500 }}>Hours</th>
              <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 500 }}>%</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map(row => (
              <tr
                key={row.name}
                style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >
                <td style={{ padding: '6px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: row.fill,
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  {row.name}
                </td>
                <td style={{ textAlign: 'right', padding: '6px 0' }}>{row.hours}h</td>
                <td style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text-muted)' }}>
                  {audit.totalHours > 0
                    ? Math.round((row.hours / audit.totalHours) * 100)
                    : 0}
                  %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
