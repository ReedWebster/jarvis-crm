import React, { useMemo, useState } from 'react';
import { BarChart2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type { TimeBlock, TimeCategory } from '../../types';
import { computeTimeAudit } from '../../utils/intelligence';

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface Props {
  timeBlocks: TimeBlock[];
  timeCategories: TimeCategory[];
}

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

type MeasureMode = 'hours' | 'percent';
type RangeOption = 7 | 14 | 30 | 90;

const RANGE_OPTIONS: { value: RangeOption; label: string }[] = [
  { value: 7, label: '7d' },
  { value: 14, label: '14d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
];

// ─── COMPONENT ──────────────────────────────────────────────────────────────

export function TimeAuditDashboard({ timeBlocks, timeCategories }: Props) {
  const [measure, setMeasure] = useState<MeasureMode>('hours');
  const [range, setRange] = useState<RangeOption>(7);

  const audit = useMemo(
    () => computeTimeAudit(timeBlocks, timeCategories, range),
    [timeBlocks, timeCategories, range],
  );

  const chartData = useMemo(() => {
    const entries = Object.entries(audit.byCategory)
      .map(([, data]) => ({
        name: data.name,
        hours: Math.round(data.hours * 10) / 10,
        percent: audit.totalHours > 0 ? Math.round((data.hours / audit.totalHours) * 1000) / 10 : 0,
        fill: data.color,
      }))
      .sort((a, b) => b.hours - a.hours);
    return entries;
  }, [audit]);

  const dataKey = measure === 'hours' ? 'hours' : 'percent';
  const unit = measure === 'hours' ? 'h' : '%';
  const rangeLabel = RANGE_OPTIONS.find(r => r.value === range)?.label ?? `${range}d`;

  return (
    <div className="caesar-card flex flex-col gap-4" style={{ padding: 20 }}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-primary)' }}>
        <BarChart2 className="w-5 h-5" />
        <h3 className="text-base font-semibold" style={{ margin: 0 }}>
          Time Audit
        </h3>

        {/* Range selector */}
        <div className="flex gap-0.5 ml-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className="px-2 py-0.5 text-[11px] font-medium transition-colors"
              style={{
                backgroundColor: range === opt.value ? 'var(--accent-color, #6366f1)' : 'transparent',
                color: range === opt.value ? '#fff' : 'var(--text-muted)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Measure toggle */}
        <div className="flex gap-0.5 rounded-lg overflow-hidden ml-auto" style={{ border: '1px solid var(--border)' }}>
          <button
            onClick={() => setMeasure('hours')}
            className="px-2 py-0.5 text-[11px] font-medium transition-colors"
            style={{
              backgroundColor: measure === 'hours' ? 'var(--accent-color, #6366f1)' : 'transparent',
              color: measure === 'hours' ? '#fff' : 'var(--text-muted)',
            }}
          >
            Hours
          </button>
          <button
            onClick={() => setMeasure('percent')}
            className="px-2 py-0.5 text-[11px] font-medium transition-colors"
            style={{
              backgroundColor: measure === 'percent' ? 'var(--accent-color, #6366f1)' : 'transparent',
              color: measure === 'percent' ? '#fff' : 'var(--text-muted)',
            }}
          >
            %
          </button>
        </div>

        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {audit.totalHours.toFixed(1)}h total
        </span>
      </div>

      {/* Charts */}
      {chartData.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Bar Chart */}
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 12 }}>
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  domain={measure === 'percent' ? [0, 100] : undefined}
                  tickFormatter={v => `${v}${unit}`}
                />
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
                  formatter={(value: number) => [`${value}${unit}`, measure === 'hours' ? 'Hours' : 'Share']}
                />
                <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey={dataKey}
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                  paddingAngle={2}
                  stroke="none"
                  label={({ name, percent, hours }) => {
                    const val = measure === 'hours' ? `${hours}h` : `${percent}%`;
                    return name.length > 10 ? `${name.slice(0, 10)}… ${val}` : `${name} ${val}`;
                  }}
                  labelLine={false}
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: 'var(--text-primary)',
                  }}
                  formatter={(value: number) => [`${value}${unit}`, measure === 'hours' ? 'Hours' : 'Share']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div
          className="text-sm text-center py-8"
          style={{ color: 'var(--text-muted)' }}
        >
          No time blocks logged in the last {rangeLabel}.
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
              <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 500 }}>Avg/day</th>
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
                <td style={{ textAlign: 'right', padding: '6px 0', fontWeight: measure === 'hours' ? 600 : 400 }}>
                  {row.hours}h
                </td>
                <td style={{ textAlign: 'right', padding: '6px 0', color: measure === 'percent' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: measure === 'percent' ? 600 : 400 }}>
                  {row.percent}%
                </td>
                <td style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text-muted)' }}>
                  {(row.hours / range).toFixed(1)}h
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
