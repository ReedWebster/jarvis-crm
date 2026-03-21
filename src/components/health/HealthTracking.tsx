import React, { useState, useMemo } from 'react';
import {
  Activity, Moon, Footprints, Heart, Flame, Dumbbell,
  Droplets, Scale, Brain, Battery, Plus, Trash2, Settings,
  TrendingUp, ChevronLeft, ChevronRight, Wifi, WifiOff,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, AreaChart, Area,
} from 'recharts';
import { format, parseISO, subDays, addDays } from 'date-fns';
import type { HealthEntry, GarminConfig, DailyMoodLog } from '../../types';
import { generateId, todayStr } from '../../utils';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  entries: HealthEntry[];
  setEntries: (fn: (prev: HealthEntry[]) => HealthEntry[]) => void;
  garminConfig: GarminConfig;
  setGarminConfig: (fn: (prev: GarminConfig) => GarminConfig) => void;
  dailyMoodLogs: DailyMoodLog[];
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

type Tab = 'log' | 'trends' | 'garmin';

const WORKOUT_TYPES = [
  'Running', 'Walking', 'Cycling', 'Swimming', 'Strength', 'HIIT',
  'Yoga', 'Hiking', 'Sports', 'Other',
];

function avg(nums: number[]): number {
  return nums.length > 0 ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="caesar-card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: color ? `${color}18` : 'var(--bg-elevated)', color: color || 'var(--text-muted)' }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
        {sub && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export function HealthTracking({ entries, setEntries, garminConfig, setGarminConfig, dailyMoodLogs }: Props) {
  const [tab, setTab] = useState<Tab>('log');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [editing, setEditing] = useState(false);

  const today = todayStr();

  // Get or create entry for selected date
  const currentEntry = useMemo(() => entries.find(e => e.date === selectedDate), [entries, selectedDate]);

  const [draft, setDraft] = useState<Partial<HealthEntry>>({});

  // Reset draft when date changes
  React.useEffect(() => {
    const existing = entries.find(e => e.date === selectedDate);
    setDraft(existing ? { ...existing } : {});
    setEditing(!existing);
  }, [selectedDate, entries]);

  const handleSave = () => {
    const entry: HealthEntry = {
      id: currentEntry?.id || generateId(),
      date: selectedDate,
      sleepHours: draft.sleepHours,
      sleepQuality: draft.sleepQuality as HealthEntry['sleepQuality'],
      steps: draft.steps,
      activeMinutes: draft.activeMinutes,
      workoutType: draft.workoutType,
      workoutDuration: draft.workoutDuration,
      caloriesBurned: draft.caloriesBurned,
      restingHR: draft.restingHR,
      avgHR: draft.avgHR,
      hrv: draft.hrv,
      bodyBattery: draft.bodyBattery,
      stressLevel: draft.stressLevel,
      spo2: draft.spo2,
      weight: draft.weight,
      bodyFat: draft.bodyFat,
      waterOz: draft.waterOz,
      calories: draft.calories,
      notes: draft.notes,
      source: draft.source || 'manual',
      createdAt: currentEntry?.createdAt || new Date().toISOString(),
    };

    setEntries(prev => {
      const idx = prev.findIndex(e => e.date === selectedDate);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = entry;
        return updated;
      }
      return [...prev, entry];
    });
    setEditing(false);
  };

  const handleDelete = () => {
    setEntries(prev => prev.filter(e => e.date !== selectedDate));
    setDraft({});
    setEditing(true);
  };

  // ─── TREND DATA (last 30 days) ──────────────────────────────────────────
  const thirtyDaysAgo = subDays(new Date(), 30);

  const trendData = useMemo(() => {
    const recent = entries
      .filter(e => { try { return parseISO(e.date) >= thirtyDaysAgo; } catch { return false; } })
      .sort((a, b) => a.date.localeCompare(b.date));

    return recent.map(e => ({
      date: format(parseISO(e.date), 'MM/dd'),
      sleep: e.sleepHours,
      steps: e.steps,
      rhr: e.restingHR,
      hrv: e.hrv,
      stress: e.stressLevel,
      battery: e.bodyBattery,
      weight: e.weight,
      active: e.activeMinutes,
      calories: e.caloriesBurned,
    }));
  }, [entries, thirtyDaysAgo]);

  // ─── SUMMARY STATS (last 7 days) ───────────────────────────────────────
  const weekStats = useMemo(() => {
    const sevenDaysAgo = subDays(new Date(), 7);
    const recent = entries.filter(e => {
      try { return parseISO(e.date) >= sevenDaysAgo; } catch { return false; }
    });

    const sleeps = recent.filter(e => e.sleepHours).map(e => e.sleepHours!);
    const steps = recent.filter(e => e.steps).map(e => e.steps!);
    const rhrs = recent.filter(e => e.restingHR).map(e => e.restingHR!);
    const hrvs = recent.filter(e => e.hrv).map(e => e.hrv!);
    const workouts = recent.filter(e => e.workoutDuration && e.workoutDuration > 0);
    const weights = recent.filter(e => e.weight).map(e => e.weight!);

    return {
      avgSleep: sleeps.length > 0 ? (sleeps.reduce((a, b) => a + b, 0) / sleeps.length).toFixed(1) : '--',
      avgSteps: avg(steps).toLocaleString(),
      avgRHR: rhrs.length > 0 ? avg(rhrs) : '--',
      avgHRV: hrvs.length > 0 ? avg(hrvs) : '--',
      workoutCount: workouts.length,
      latestWeight: weights.length > 0 ? weights[weights.length - 1] : '--',
      daysLogged: recent.length,
    };
  }, [entries]);

  // ─── COMBINED MOOD + HEALTH DATA (for trends) ──────────────────────────
  const moodHealthData = useMemo(() => {
    const recent = entries
      .filter(e => { try { return parseISO(e.date) >= thirtyDaysAgo; } catch { return false; } })
      .sort((a, b) => a.date.localeCompare(b.date));

    return recent.map(e => {
      const mood = dailyMoodLogs.find(m => m.date === e.date);
      return {
        date: format(parseISO(e.date), 'MM/dd'),
        sleep: e.sleepHours,
        mood: mood?.mood,
        energy: mood?.energy,
        stress: e.stressLevel,
      };
    });
  }, [entries, dailyMoodLogs, thirtyDaysAgo]);

  const chartTooltipStyle = {
    backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12,
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header + Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity size={20} style={{ color: 'var(--text-primary)' }} />
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Health Tracking</h2>
          {garminConfig.connected && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}>
              Garmin Connected
            </span>
          )}
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          {(['log', 'trends', 'garmin'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                backgroundColor: tab === t ? 'var(--bg-card)' : 'transparent',
                color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: tab === t ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {t === 'log' ? 'Daily Log' : t === 'trends' ? 'Trends' : 'Garmin'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards (always visible) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard icon={<Moon size={16} />} label="Avg Sleep" value={`${weekStats.avgSleep}h`} sub="last 7 days" color="#818cf8" />
        <StatCard icon={<Footprints size={16} />} label="Avg Steps" value={weekStats.avgSteps} sub="last 7 days" color="#22c55e" />
        <StatCard icon={<Heart size={16} />} label="Avg RHR" value={`${weekStats.avgRHR}`} sub="bpm" color="#ef4444" />
        <StatCard icon={<Brain size={16} />} label="Avg HRV" value={`${weekStats.avgHRV}`} sub="ms" color="#8b5cf6" />
        <StatCard icon={<Dumbbell size={16} />} label="Workouts" value={weekStats.workoutCount} sub="last 7 days" color="#f97316" />
        <StatCard icon={<Scale size={16} />} label="Weight" value={weekStats.latestWeight !== '--' ? `${weekStats.latestWeight}` : '--'} sub="lbs" color="#06b6d4" />
        <StatCard icon={<Activity size={16} />} label="Days Logged" value={weekStats.daysLogged} sub="last 7 days" color="#eab308" />
      </div>

      {/* TAB: Daily Log */}
      {tab === 'log' && (
        <div className="space-y-4">
          {/* Date navigation */}
          <div className="flex items-center justify-center gap-3">
            <button className="caesar-btn-ghost p-1.5" onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), -1), 'yyyy-MM-dd'))}>
              <ChevronLeft size={16} />
            </button>
            <input
              type="date"
              value={selectedDate}
              max={today}
              onChange={e => setSelectedDate(e.target.value)}
              className="caesar-input text-sm text-center w-40"
            />
            <button
              className="caesar-btn-ghost p-1.5"
              disabled={selectedDate >= today}
              onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Entry form / view */}
          {editing ? (
            <div className="caesar-card p-5 space-y-5">
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Plus size={14} /> {currentEntry ? 'Edit Entry' : 'New Entry'} — {format(parseISO(selectedDate), 'MMM d, yyyy')}
              </h3>

              {/* Sleep */}
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#818cf8' }}>
                  <Moon size={12} /> Sleep
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Hours</span>
                    <input type="number" step="0.5" min="0" max="24" className="caesar-input text-sm w-full" placeholder="7.5"
                      value={draft.sleepHours ?? ''} onChange={e => setDraft(d => ({ ...d, sleepHours: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Quality (1–5)</span>
                    <input type="number" min="1" max="5" className="caesar-input text-sm w-full" placeholder="4"
                      value={draft.sleepQuality ?? ''} onChange={e => setDraft(d => ({ ...d, sleepQuality: e.target.value ? Number(e.target.value) as 1|2|3|4|5 : undefined }))} />
                  </label>
                </div>
              </fieldset>

              {/* Activity */}
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#22c55e' }}>
                  <Footprints size={12} /> Activity
                </legend>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Steps</span>
                    <input type="number" min="0" className="caesar-input text-sm w-full" placeholder="10000"
                      value={draft.steps ?? ''} onChange={e => setDraft(d => ({ ...d, steps: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Active Min</span>
                    <input type="number" min="0" className="caesar-input text-sm w-full" placeholder="45"
                      value={draft.activeMinutes ?? ''} onChange={e => setDraft(d => ({ ...d, activeMinutes: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Calories Burned</span>
                    <input type="number" min="0" className="caesar-input text-sm w-full" placeholder="350"
                      value={draft.caloriesBurned ?? ''} onChange={e => setDraft(d => ({ ...d, caloriesBurned: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Workout Type</span>
                    <select className="caesar-input text-sm w-full"
                      value={draft.workoutType ?? ''} onChange={e => setDraft(d => ({ ...d, workoutType: e.target.value || undefined }))}>
                      <option value="">None</option>
                      {WORKOUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                </div>
                {draft.workoutType && (
                  <label className="space-y-1 max-w-[200px]">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Workout Duration (min)</span>
                    <input type="number" min="0" className="caesar-input text-sm w-full" placeholder="60"
                      value={draft.workoutDuration ?? ''} onChange={e => setDraft(d => ({ ...d, workoutDuration: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                )}
              </fieldset>

              {/* Vitals */}
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#ef4444' }}>
                  <Heart size={12} /> Vitals
                </legend>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Resting HR</span>
                    <input type="number" min="30" max="200" className="caesar-input text-sm w-full" placeholder="62"
                      value={draft.restingHR ?? ''} onChange={e => setDraft(d => ({ ...d, restingHR: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Avg HR</span>
                    <input type="number" min="30" max="220" className="caesar-input text-sm w-full" placeholder="72"
                      value={draft.avgHR ?? ''} onChange={e => setDraft(d => ({ ...d, avgHR: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>HRV (ms)</span>
                    <input type="number" min="0" max="300" className="caesar-input text-sm w-full" placeholder="45"
                      value={draft.hrv ?? ''} onChange={e => setDraft(d => ({ ...d, hrv: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Body Battery</span>
                    <input type="number" min="0" max="100" className="caesar-input text-sm w-full" placeholder="75"
                      value={draft.bodyBattery ?? ''} onChange={e => setDraft(d => ({ ...d, bodyBattery: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Stress (0–100)</span>
                    <input type="number" min="0" max="100" className="caesar-input text-sm w-full" placeholder="30"
                      value={draft.stressLevel ?? ''} onChange={e => setDraft(d => ({ ...d, stressLevel: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>SpO2 (%)</span>
                    <input type="number" min="80" max="100" className="caesar-input text-sm w-full" placeholder="97"
                      value={draft.spo2 ?? ''} onChange={e => setDraft(d => ({ ...d, spo2: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                </div>
              </fieldset>

              {/* Body */}
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#06b6d4' }}>
                  <Scale size={12} /> Body
                </legend>
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Weight (lbs)</span>
                    <input type="number" step="0.1" min="0" className="caesar-input text-sm w-full" placeholder="175"
                      value={draft.weight ?? ''} onChange={e => setDraft(d => ({ ...d, weight: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Body Fat (%)</span>
                    <input type="number" step="0.1" min="0" max="60" className="caesar-input text-sm w-full" placeholder="15"
                      value={draft.bodyFat ?? ''} onChange={e => setDraft(d => ({ ...d, bodyFat: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                </div>
              </fieldset>

              {/* Nutrition */}
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#eab308' }}>
                  <Droplets size={12} /> Nutrition & Hydration
                </legend>
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Water (oz)</span>
                    <input type="number" min="0" className="caesar-input text-sm w-full" placeholder="80"
                      value={draft.waterOz ?? ''} onChange={e => setDraft(d => ({ ...d, waterOz: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Calories Eaten</span>
                    <input type="number" min="0" className="caesar-input text-sm w-full" placeholder="2200"
                      value={draft.calories ?? ''} onChange={e => setDraft(d => ({ ...d, calories: e.target.value ? Number(e.target.value) : undefined }))} />
                  </label>
                </div>
              </fieldset>

              {/* Notes */}
              <label className="space-y-1">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Notes</span>
                <textarea className="caesar-input text-sm w-full" rows={2} placeholder="How are you feeling today?"
                  value={draft.notes ?? ''} onChange={e => setDraft(d => ({ ...d, notes: e.target.value || undefined }))} />
              </label>

              <div className="flex gap-2">
                <button className="caesar-btn text-xs px-4 py-2" onClick={handleSave}>Save Entry</button>
                {currentEntry && (
                  <button className="caesar-btn-ghost text-xs px-3 py-2" onClick={() => setEditing(false)}>Cancel</button>
                )}
              </div>
            </div>
          ) : currentEntry ? (
            <div className="caesar-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {format(parseISO(selectedDate), 'EEEE, MMM d, yyyy')}
                </h3>
                <div className="flex gap-2">
                  <button className="caesar-btn-ghost text-xs px-3 py-1" onClick={() => setEditing(true)}>Edit</button>
                  <button className="caesar-btn-ghost text-xs px-2 py-1" onClick={handleDelete} style={{ color: '#ef4444' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {currentEntry.sleepHours != null && (
                  <div>
                    <p className="text-[11px] flex items-center gap-1" style={{ color: '#818cf8' }}><Moon size={10} /> Sleep</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{currentEntry.sleepHours}h {currentEntry.sleepQuality ? `(${currentEntry.sleepQuality}/5)` : ''}</p>
                  </div>
                )}
                {currentEntry.steps != null && (
                  <div>
                    <p className="text-[11px] flex items-center gap-1" style={{ color: '#22c55e' }}><Footprints size={10} /> Steps</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{currentEntry.steps.toLocaleString()}</p>
                  </div>
                )}
                {currentEntry.activeMinutes != null && (
                  <div>
                    <p className="text-[11px] flex items-center gap-1" style={{ color: '#22c55e' }}><Activity size={10} /> Active</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{currentEntry.activeMinutes} min</p>
                  </div>
                )}
                {currentEntry.workoutType && (
                  <div>
                    <p className="text-[11px] flex items-center gap-1" style={{ color: '#f97316' }}><Dumbbell size={10} /> Workout</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{currentEntry.workoutType} {currentEntry.workoutDuration ? `(${currentEntry.workoutDuration}min)` : ''}</p>
                  </div>
                )}
                {currentEntry.caloriesBurned != null && (
                  <div>
                    <p className="text-[11px] flex items-center gap-1" style={{ color: '#f97316' }}><Flame size={10} /> Burned</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{currentEntry.caloriesBurned} cal</p>
                  </div>
                )}
                {currentEntry.restingHR != null && (
                  <div>
                    <p className="text-[11px] flex items-center gap-1" style={{ color: '#ef4444' }}><Heart size={10} /> Resting HR</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{currentEntry.restingHR} bpm</p>
                  </div>
                )}
                {currentEntry.hrv != null && (
                  <div>
                    <p className="text-[11px] flex items-center gap-1" style={{ color: '#8b5cf6' }}><Brain size={10} /> HRV</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{currentEntry.hrv} ms</p>
                  </div>
                )}
                {currentEntry.bodyBattery != null && (
                  <div>
                    <p className="text-[11px] flex items-center gap-1" style={{ color: '#22c55e' }}><Battery size={10} /> Body Battery</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{currentEntry.bodyBattery}%</p>
                  </div>
                )}
                {currentEntry.stressLevel != null && (
                  <div>
                    <p className="text-[11px] flex items-center gap-1" style={{ color: '#eab308' }}><Brain size={10} /> Stress</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{currentEntry.stressLevel}/100</p>
                  </div>
                )}
                {currentEntry.spo2 != null && (
                  <div>
                    <p className="text-[11px] flex items-center gap-1" style={{ color: '#06b6d4' }}><Droplets size={10} /> SpO2</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{currentEntry.spo2}%</p>
                  </div>
                )}
                {currentEntry.weight != null && (
                  <div>
                    <p className="text-[11px] flex items-center gap-1" style={{ color: '#06b6d4' }}><Scale size={10} /> Weight</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{currentEntry.weight} lbs</p>
                  </div>
                )}
                {currentEntry.waterOz != null && (
                  <div>
                    <p className="text-[11px] flex items-center gap-1" style={{ color: '#3b82f6' }}><Droplets size={10} /> Water</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{currentEntry.waterOz} oz</p>
                  </div>
                )}
                {currentEntry.calories != null && (
                  <div>
                    <p className="text-[11px] flex items-center gap-1" style={{ color: '#eab308' }}><Flame size={10} /> Calories</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{currentEntry.calories.toLocaleString()}</p>
                  </div>
                )}
              </div>

              {currentEntry.notes && (
                <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{currentEntry.notes}</p>
                </div>
              )}

              {currentEntry.source === 'garmin' && (
                <p className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  <Wifi size={10} /> Synced from Garmin
                </p>
              )}
            </div>
          ) : (
            <div className="caesar-card p-8 text-center">
              <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>No entry for {format(parseISO(selectedDate), 'MMM d, yyyy')}</p>
              <button className="caesar-btn text-xs px-4 py-2" onClick={() => setEditing(true)}>
                <Plus size={12} className="inline mr-1" /> Log Health Data
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB: Trends */}
      {tab === 'trends' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Sleep trend */}
          <div className="caesar-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Moon size={14} style={{ color: '#818cf8' }} /> Sleep (30d)
            </h3>
            {trendData.filter(d => d.sleep != null).length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData.filter(d => d.sleep != null)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis domain={[0, 12]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Area type="monotone" dataKey="sleep" stroke="#818cf8" fill="#818cf820" strokeWidth={2} name="Hours" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-center py-10" style={{ color: 'var(--text-muted)' }}>No sleep data yet</p>}
          </div>

          {/* Steps trend */}
          <div className="caesar-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Footprints size={14} style={{ color: '#22c55e' }} /> Steps (30d)
            </h3>
            {trendData.filter(d => d.steps != null).length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData.filter(d => d.steps != null)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="steps" fill="#22c55e" radius={[3, 3, 0, 0]} name="Steps" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-center py-10" style={{ color: 'var(--text-muted)' }}>No step data yet</p>}
          </div>

          {/* Heart Rate + HRV */}
          <div className="caesar-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Heart size={14} style={{ color: '#ef4444' }} /> Resting HR & HRV (30d)
            </h3>
            {trendData.filter(d => d.rhr != null || d.hrv != null).length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData.filter(d => d.rhr != null || d.hrv != null)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Line type="monotone" dataKey="rhr" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} name="RHR (bpm)" />
                  <Line type="monotone" dataKey="hrv" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} name="HRV (ms)" />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-center py-10" style={{ color: 'var(--text-muted)' }}>No heart rate data yet</p>}
          </div>

          {/* Body Battery + Stress */}
          <div className="caesar-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Battery size={14} style={{ color: '#22c55e' }} /> Body Battery & Stress (30d)
            </h3>
            {trendData.filter(d => d.battery != null || d.stress != null).length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData.filter(d => d.battery != null || d.stress != null)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Line type="monotone" dataKey="battery" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} name="Body Battery" />
                  <Line type="monotone" dataKey="stress" stroke="#eab308" strokeWidth={2} dot={{ r: 2 }} name="Stress" />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-center py-10" style={{ color: 'var(--text-muted)' }}>No body battery data yet</p>}
          </div>

          {/* Weight trend */}
          <div className="caesar-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Scale size={14} style={{ color: '#06b6d4' }} /> Weight (30d)
            </h3>
            {trendData.filter(d => d.weight != null).length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData.filter(d => d.weight != null)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis domain={['dataMin - 5', 'dataMax + 5']} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Line type="monotone" dataKey="weight" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} name="Weight (lbs)" />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-center py-10" style={{ color: 'var(--text-muted)' }}>No weight data yet</p>}
          </div>

          {/* Mood + Sleep + Stress correlation */}
          <div className="caesar-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <TrendingUp size={14} style={{ color: '#ec4899' }} /> Sleep vs Mood & Stress
            </h3>
            {moodHealthData.filter(d => d.sleep != null && (d.mood != null || d.stress != null)).length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={moodHealthData.filter(d => d.sleep != null)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Line type="monotone" dataKey="sleep" stroke="#818cf8" strokeWidth={2} dot={{ r: 2 }} name="Sleep (h)" />
                  <Line type="monotone" dataKey="mood" stroke="#ec4899" strokeWidth={2} dot={{ r: 2 }} name="Mood (1–5)" />
                  <Line type="monotone" dataKey="energy" stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} name="Energy (1–5)" />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-center py-10" style={{ color: 'var(--text-muted)' }}>Log both health and mood data to see correlations</p>}
          </div>
        </div>
      )}

      {/* TAB: Garmin Settings */}
      {tab === 'garmin' && (
        <div className="caesar-card p-5 space-y-5 max-w-xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <Activity size={24} style={{ color: garminConfig.connected ? '#22c55e' : 'var(--text-muted)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Garmin Connect</h3>
              <p className="text-xs flex items-center gap-1" style={{ color: garminConfig.connected ? '#22c55e' : 'var(--text-muted)' }}>
                {garminConfig.connected ? <><Wifi size={10} /> Connected</> : <><WifiOff size={10} /> Not connected</>}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-lg text-xs space-y-3" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>How to connect your Garmin:</p>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>Apply for the <strong>Garmin Health API</strong> at <span style={{ color: '#818cf8' }}>developer.garmin.com</span></li>
              <li>Create a new app and get your <strong>Consumer Key</strong> and <strong>Consumer Secret</strong></li>
              <li>Set the callback URL to your Litehouse deployment + <code>/api/oauth?provider=garmin</code></li>
              <li>Enter your credentials below and click Connect</li>
            </ol>
            <p className="pt-2">The Garmin Health API provides: daily summaries, sleep data, heart rate, stress, body battery, activities, and more.</p>
          </div>

          <div className="space-y-3">
            <label className="space-y-1">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Consumer Key</span>
              <input
                type="text"
                className="caesar-input text-sm w-full"
                placeholder="Enter Garmin Consumer Key"
                value={garminConfig.consumerKey ?? ''}
                onChange={e => setGarminConfig(prev => ({ ...prev, consumerKey: e.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Consumer Secret</span>
              <input
                type="password"
                className="caesar-input text-sm w-full"
                placeholder="Enter Garmin Consumer Secret"
                value={garminConfig.consumerSecret ?? ''}
                onChange={e => setGarminConfig(prev => ({ ...prev, consumerSecret: e.target.value }))}
              />
            </label>
          </div>

          <div className="flex gap-2">
            {!garminConfig.connected ? (
              <button
                className="caesar-btn text-xs px-4 py-2"
                disabled={!garminConfig.consumerKey || !garminConfig.consumerSecret}
                onClick={() => {
                  // OAuth flow — redirect to Garmin authorization
                  const params = new URLSearchParams({
                    provider: 'garmin',
                    consumer_key: garminConfig.consumerKey!,
                    consumer_secret: garminConfig.consumerSecret!,
                  });
                  window.location.href = `/api/oauth?${params}`;
                }}
              >
                <Settings size={12} className="inline mr-1" /> Connect Garmin
              </button>
            ) : (
              <button
                className="caesar-btn-ghost text-xs px-4 py-2"
                style={{ color: '#ef4444' }}
                onClick={() => setGarminConfig(() => ({ connected: false }))}
              >
                Disconnect
              </button>
            )}
          </div>

          {garminConfig.lastSyncAt && (
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Last synced: {format(parseISO(garminConfig.lastSyncAt), 'MMM d, yyyy h:mm a')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
