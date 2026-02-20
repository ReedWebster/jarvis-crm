import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Plus,
  Edit3,
  Trash2,
  Target,
  PieChart as PieIcon,
  BarChart2,
  Check,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Upload,
  Search,
  Download,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import type { FinancialEntry, SavingsGoal, VentureFinancial } from '../../types';
import { generateId, todayStr, formatDate } from '../../utils';
import { Modal } from '../shared/Modal';
import { CSVImportModal } from './CSVImportModal';
import { useTheme } from '../../hooks/useTheme';

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface Props {
  financialEntries: FinancialEntry[];
  setFinancialEntries: (v: FinancialEntry[] | ((p: FinancialEntry[]) => FinancialEntry[])) => void;
  savingsGoals: SavingsGoal[];
  setSavingsGoals: (v: SavingsGoal[] | ((p: SavingsGoal[]) => SavingsGoal[])) => void;
  ventureFinancials: VentureFinancial[];
  setVentureFinancials: (v: VentureFinancial[] | ((p: VentureFinancial[]) => VentureFinancial[])) => void;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function getMonthKey(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'yyyy-MM');
  } catch {
    return '';
  }
}

function currentMonthRange() {
  const now = new Date();
  return { start: startOfMonth(now), end: endOfMonth(now) };
}

function last6MonthKeys(): string[] {
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    keys.push(format(subMonths(new Date(), i), 'yyyy-MM'));
  }
  return keys;
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────

function exportToCSV(entries: FinancialEntry[]) {
  const header = 'Date,Description,Amount,Type,Category,Venture\n';
  const rows = entries
    .map(
      (e) =>
        `${e.date},"${e.description}",${e.amount},${e.type},"${e.category}","${e.ventureId ?? ''}"`
    )
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jarvis-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CUSTOM TOOLTIP ──────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {fmt$(p.value)}
        </p>
      ))}
    </div>
  );
};

// ─── BANK BADGE ───────────────────────────────────────────────────────────────

function BankBadge({ bank }: { bank?: string }) {
  if (!bank) return null;
  const isAFCU = bank === 'afcu';
  const isMercury = bank === 'mercury';
  if (!isAFCU && !isMercury) return null;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: 4,
        backgroundColor: isAFCU ? 'rgba(59,130,246,0.15)' : 'rgba(20,184,166,0.15)',
        color: isAFCU ? '#60a5fa' : '#2dd4bf',
        border: `1px solid ${isAFCU ? 'rgba(59,130,246,0.3)' : 'rgba(20,184,166,0.3)'}`,
        whiteSpace: 'nowrap' as const,
      }}
    >
      {isAFCU ? 'AFCU' : 'Mercury'}
    </span>
  );
}

// ─── EMPTY TRANSACTION FORM ───────────────────────────────────────────────────

interface TxForm {
  date: string;
  description: string;
  amount: string;
  type: 'income' | 'expense';
  category: string;
  ventureId: string;
}

function emptyTxForm(): TxForm {
  return { date: todayStr(), description: '', amount: '', type: 'income', category: '', ventureId: '' };
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function FinancialSnapshot({
  financialEntries,
  setFinancialEntries,
  savingsGoals,
  setSavingsGoals,
  ventureFinancials,
  setVentureFinancials,
}: Props) {

  const { chartColors } = useTheme();

  // ── UI State ──────────────────────────────────────────────────────────────
  const [activeVentureTab, setActiveVentureTab] = useState<string>(
    ventureFinancials[0]?.id ?? ''
  );
  const [showTxModal, setShowTxModal] = useState(false);
  const [editingTx, setEditingTx] = useState<FinancialEntry | null>(null);
  const [txForm, setTxForm] = useState<TxForm>(emptyTxForm());
  const [txSource, setTxSource] = useState<'global' | string>('global');

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [goalForm, setGoalForm] = useState({ name: '', target: '', current: '', deadline: '', color: '#00CFFF' });

  const [txSearch, setTxSearch] = useState('');
  const [txFilterType, setTxFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [txFilterCategory, setTxFilterCategory] = useState('');
  const [txFilterVenture, setTxFilterVenture] = useState('');

  // Ledger state
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [ledgerBankFilter, setLedgerBankFilter] = useState<'all' | 'afcu' | 'mercury'>('all');

  // CSV import state
  const [importOpen, setImportOpen] = useState(false);

  // ── Derived: Current Month Stats ─────────────────────────────────────────
  const currentMonthStats = useMemo(() => {
    const { start, end } = currentMonthRange();
    const thisMonthEntries = financialEntries.filter((e) => {
      try {
        return isWithinInterval(parseISO(e.date), { start, end });
      } catch {
        return false;
      }
    });
    const income = thisMonthEntries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const expenses = thisMonthEntries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const net = income - expenses;
    const tithing = income * 0.1;
    return { income, expenses, net, tithing };
  }, [financialEntries]);

  const tithingLogged = useMemo(() => {
    const { start, end } = currentMonthRange();
    return financialEntries.some((e) => {
      try {
        return (
          e.category.toLowerCase() === 'tithing' &&
          isWithinInterval(parseISO(e.date), { start, end })
        );
      } catch {
        return false;
      }
    });
  }, [financialEntries]);

  // ── Derived: Last 6 Months Chart Data ────────────────────────────────────
  const barChartData = useMemo(() => {
    const keys = last6MonthKeys();
    return keys.map((monthKey) => {
      const month = parseISO(monthKey + '-01');
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const entries = financialEntries.filter((e) => {
        try {
          return isWithinInterval(parseISO(e.date), { start, end });
        } catch {
          return false;
        }
      });
      const income = entries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);
      const expenses = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
      return { month: format(month, 'MMM yy'), income, expenses };
    });
  }, [financialEntries]);

  // ── Derived: Venture P&L ──────────────────────────────────────────────────
  const activeVenture = useMemo(
    () => ventureFinancials.find((v) => v.id === activeVentureTab) ?? ventureFinancials[0],
    [ventureFinancials, activeVentureTab]
  );

  const venturePnL = useMemo(() => {
    if (!activeVenture) return { revenue: 0, expenses: 0, net: 0, momChange: 0, chartData: [] };

    const allEntries = [
      ...financialEntries.filter((e) => e.ventureId === activeVenture.id),
      ...(activeVenture.entries ?? []),
    ];
    const seen = new Set<string>();
    const entries = allEntries.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    const { start: csStart, end: csEnd } = currentMonthRange();
    const prevMonthStart = startOfMonth(subMonths(new Date(), 1));
    const prevMonthEnd = endOfMonth(subMonths(new Date(), 1));

    const thisMonth = entries.filter((e) => {
      try { return isWithinInterval(parseISO(e.date), { start: csStart, end: csEnd }); } catch { return false; }
    });
    const lastMonth = entries.filter((e) => {
      try { return isWithinInterval(parseISO(e.date), { start: prevMonthStart, end: prevMonthEnd }); } catch { return false; }
    });

    const revenue = thisMonth.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const expenses = thisMonth.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const net = revenue - expenses;

    const prevNet =
      lastMonth.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0) -
      lastMonth.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const momChange = prevNet !== 0 ? ((net - prevNet) / Math.abs(prevNet)) * 100 : 0;

    const keys = last6MonthKeys();
    const chartData = keys.map((monthKey) => {
      const month = parseISO(monthKey + '-01');
      const s = startOfMonth(month);
      const en = endOfMonth(month);
      const mes = entries.filter((e) => {
        try { return isWithinInterval(parseISO(e.date), { start: s, end: en }); } catch { return false; }
      });
      const inc = mes.filter((e) => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
      const exp = mes.filter((e) => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
      return { month: format(month, 'MMM yy'), net: inc - exp };
    });

    return { revenue, expenses, net, momChange, chartData };
  }, [activeVenture, financialEntries]);

  // ── Derived: Venture transactions ─────────────────────────────────────────
  const ventureTransactions = useMemo(() => {
    if (!activeVenture) return [];
    const allEntries = [
      ...financialEntries.filter((e) => e.ventureId === activeVenture.id),
      ...(activeVenture.entries ?? []),
    ];
    const seen = new Set<string>();
    return allEntries
      .filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [activeVenture, financialEntries]);

  // ── Derived: Legacy filtered entries (transaction log) ────────────────────
  const filteredGlobalEntries = useMemo(() => {
    return financialEntries
      .filter((e) => {
        if (txFilterType !== 'all' && e.type !== txFilterType) return false;
        if (txFilterCategory && !e.category.toLowerCase().includes(txFilterCategory.toLowerCase())) return false;
        if (txFilterVenture && e.ventureId !== txFilterVenture) return false;
        if (txSearch) {
          const q = txSearch.toLowerCase();
          return (
            e.description.toLowerCase().includes(q) ||
            e.category.toLowerCase().includes(q) ||
            (e.ventureId ?? '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [financialEntries, txSearch, txFilterType, txFilterCategory, txFilterVenture]);

  // ── Derived: Ledger entries ───────────────────────────────────────────────
  const filteredLedgerEntries = useMemo(() => {
    return financialEntries
      .filter((e) => {
        if (ledgerTypeFilter !== 'all' && e.type !== ledgerTypeFilter) return false;
        if (ledgerBankFilter !== 'all') {
          const entryBank = (e as any).bank;
          if (entryBank !== ledgerBankFilter) return false;
        }
        if (ledgerSearch) {
          const q = ledgerSearch.toLowerCase();
          return (
            e.description.toLowerCase().includes(q) ||
            e.category.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [financialEntries, ledgerSearch, ledgerTypeFilter, ledgerBankFilter]);

  // ── Categories ────────────────────────────────────────────────────────────
  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(financialEntries.map((e) => e.category).filter(Boolean)));
  }, [financialEntries]);

  // ── Transaction CRUD ──────────────────────────────────────────────────────
  function openAddTx(source: 'global' | string = 'global') {
    setEditingTx(null);
    setTxSource(source);
    setTxForm({ ...emptyTxForm(), ventureId: source !== 'global' ? source : '' });
    setShowTxModal(true);
  }

  function openEditTx(entry: FinancialEntry, source: 'global' | string = 'global') {
    setEditingTx(entry);
    setTxSource(source);
    setTxForm({
      date: entry.date,
      description: entry.description,
      amount: String(entry.amount),
      type: entry.type,
      category: entry.category,
      ventureId: entry.ventureId ?? '',
    });
    setShowTxModal(true);
  }

  function saveTx() {
    const amt = parseFloat(txForm.amount);
    if (!txForm.description || isNaN(amt) || !txForm.date) return;
    const entry: FinancialEntry = {
      id: editingTx?.id ?? generateId(),
      date: txForm.date,
      description: txForm.description,
      amount: amt,
      type: txForm.type,
      category: txForm.category,
      ventureId: txForm.ventureId || undefined,
    };
    if (editingTx) {
      setFinancialEntries((prev) => prev.map((e) => (e.id === editingTx.id ? entry : e)));
      if (txSource !== 'global') {
        setVentureFinancials((prev) =>
          prev.map((v) =>
            v.id === txSource
              ? { ...v, entries: (v.entries ?? []).map((e) => (e.id === editingTx.id ? entry : e)) }
              : v
          )
        );
      }
    } else {
      setFinancialEntries((prev) => [...prev, entry]);
      if (txSource !== 'global' && txForm.ventureId) {
        setVentureFinancials((prev) =>
          prev.map((v) =>
            v.id === txSource ? { ...v, entries: [...(v.entries ?? []), entry] } : v
          )
        );
      }
    }
    setShowTxModal(false);
  }

  function deleteTx(id: string, source: 'global' | string = 'global') {
    setFinancialEntries((prev) => prev.filter((e) => e.id !== id));
    if (source !== 'global') {
      setVentureFinancials((prev) =>
        prev.map((v) =>
          v.id === source ? { ...v, entries: (v.entries ?? []).filter((e) => e.id !== id) } : v
        )
      );
    }
  }

  // ── Import handler ────────────────────────────────────────────────────────
  function handleImport(entries: FinancialEntry[]) {
    setFinancialEntries((prev) => {
      const existingIds = new Set(prev.map((e) => e.id));
      const newEntries = entries.filter((e) => !existingIds.has(e.id));
      return [...prev, ...newEntries];
    });

    // Distribute venture entries
    setVentureFinancials((prev) =>
      prev.map((v) => {
        const ventureEntries = entries.filter((e) => e.ventureId === v.id);
        if (ventureEntries.length === 0) return v;
        const existingIds = new Set((v.entries ?? []).map((e) => e.id));
        const newVentureEntries = ventureEntries.filter((e) => !existingIds.has(e.id));
        return { ...v, entries: [...(v.entries ?? []), ...newVentureEntries] };
      })
    );
  }

  // ── Savings Goal CRUD ─────────────────────────────────────────────────────
  function openAddGoal() {
    setEditingGoal(null);
    setGoalForm({ name: '', target: '', current: '', deadline: '', color: '#00CFFF' });
    setShowGoalModal(true);
  }

  function openEditGoal(goal: SavingsGoal) {
    setEditingGoal(goal);
    setGoalForm({
      name: goal.name,
      target: String(goal.target),
      current: String(goal.current),
      deadline: goal.deadline,
      color: goal.color,
    });
    setShowGoalModal(true);
  }

  function saveGoal() {
    const target = parseFloat(goalForm.target);
    const current = parseFloat(goalForm.current);
    if (!goalForm.name || isNaN(target)) return;
    const goal: SavingsGoal = {
      id: editingGoal?.id ?? generateId(),
      name: goalForm.name,
      target,
      current: isNaN(current) ? 0 : current,
      deadline: goalForm.deadline,
      color: goalForm.color,
    };
    if (editingGoal) {
      setSavingsGoals((prev) => prev.map((g) => (g.id === editingGoal.id ? goal : g)));
    } else {
      setSavingsGoals((prev) => [...prev, goal]);
    }
    setShowGoalModal(false);
  }

  function deleteGoal(id: string) {
    setSavingsGoals((prev) => prev.filter((g) => g.id !== id));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── 1. SECTION HEADER ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="section-title">
          {format(new Date(), 'MMMM yyyy')} Overview
        </h2>
        <button
          onClick={() => setImportOpen(true)}
          className="caesar-btn-primary flex items-center gap-2"
          style={{ fontSize: 13 }}
        >
          <Upload size={14} />
          Import Transactions
        </button>
      </div>

      {/* ── 2. STATS ROW ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Total Income */}
        <div className="caesar-card flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
              }}
            >
              Income
            </span>
            <ArrowUpRight size={16} className="text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400">{fmt$(currentMonthStats.income)}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Monthly gross</p>
        </div>

        {/* Total Expenses */}
        <div className="caesar-card flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
              }}
            >
              Expenses
            </span>
            <ArrowDownRight size={16} className="text-red-400" />
          </div>
          <p className="text-2xl font-bold text-red-400">{fmt$(currentMonthStats.expenses)}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Monthly spend</p>
        </div>

        {/* Net */}
        <div className="caesar-card flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
              }}
            >
              Net
            </span>
            {currentMonthStats.net >= 0 ? (
              <TrendingUp size={16} className="text-arc-blue" />
            ) : (
              <TrendingDown size={16} className="text-red-400" />
            )}
          </div>
          <p
            className={`text-2xl font-bold ${currentMonthStats.net >= 0 ? 'text-arc-blue' : 'text-red-400'}`}
          >
            {fmt$(currentMonthStats.net)}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Income − Expenses</p>
        </div>

        {/* Tithing */}
        <div
          className="caesar-card flex flex-col gap-2 relative overflow-hidden"
          style={
            !tithingLogged
              ? { boxShadow: '0 0 18px 2px rgba(255, 215, 0, 0.35)', borderColor: 'rgba(255,215,0,0.5)' }
              : {}
          }
        >
          <div className="flex items-center justify-between">
            <span
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
              }}
            >
              Tithing Due
            </span>
            {tithingLogged ? (
              <Check size={16} className="text-emerald-400" />
            ) : (
              <AlertCircle size={16} style={{ color: '#FFD700' }} />
            )}
          </div>
          <p className="text-2xl font-bold" style={{ color: '#FFD700' }}>
            {fmt$(currentMonthStats.tithing)}
          </p>
          <p style={{ fontSize: 12, color: tithingLogged ? '#22c55e' : '#FFD700' }}>
            {tithingLogged ? 'Logged this month' : '10% — not yet logged'}
          </p>
          {!tithingLogged && (
            <div
              className="absolute inset-0 pointer-events-none rounded-xl"
              style={{ background: 'radial-gradient(ellipse at top right, rgba(255,215,0,0.08), transparent 70%)' }}
            />
          )}
        </div>
      </div>

      {/* ── 3. INCOME vs EXPENSES CHART ──────────────────────────────────── */}
      <div className="caesar-card">
        <div className="flex items-center gap-2 mb-5">
          <BarChart2 size={18} style={{ color: '#00CFFF' }} />
          <h3
            style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}
          >
            Income vs Expenses — Last 6 Months
          </h3>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barChartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: chartColors.text, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: chartColors.text, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: chartColors.text }} />
            <Bar dataKey="income" name="Income" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── 4. SAVINGS GOALS ─────────────────────────────────────────────── */}
      <div className="caesar-card">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Target size={18} style={{ color: '#FFD700' }} />
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Savings Goals
            </h3>
          </div>
          <button onClick={openAddGoal} className="caesar-btn-ghost flex items-center gap-1 text-xs">
            <Plus size={13} /> Add Goal
          </button>
        </div>

        {savingsGoals.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
            No savings goals yet. Add one to track progress.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savingsGoals.map((goal) => {
              const pct = Math.min(100, goal.target > 0 ? (goal.current / goal.target) * 100 : 0);
              const daysLeft = goal.deadline
                ? Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86400000)
                : null;

              return (
                <div
                  key={goal.id}
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 16,
                    boxShadow: `0 0 12px 1px ${goal.color}22`,
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {goal.name}
                      </p>
                      {goal.deadline && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          Due {formatDate(goal.deadline)}
                          {daysLeft !== null && (
                            <span
                              style={{
                                marginLeft: 8,
                                color: daysLeft < 0 ? '#ef4444' : daysLeft < 30 ? '#eab308' : 'var(--text-muted)',
                              }}
                            >
                              ({daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`})
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditGoal(goal)}
                        className="p-1 rounded transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                        }}
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        className="p-1 rounded transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = '#ef4444';
                          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs mb-2">
                    <span style={{ color: goal.color, fontWeight: 600 }}>{fmt$(goal.current)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{pct.toFixed(1)}%</span>
                    <span style={{ color: 'var(--text-muted)' }}>{fmt$(goal.target)}</span>
                  </div>

                  <div
                    style={{
                      height: 8,
                      backgroundColor: 'var(--bg-card)',
                      borderRadius: 4,
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        right: `${100 - pct}%`,
                        left: 0,
                        borderRadius: 4,
                        backgroundColor: goal.color,
                        boxShadow: `0 0 8px 2px ${goal.color}70`,
                        transition: 'right 0.7s',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 5. VENTURE P&L DASHBOARD ─────────────────────────────────────── */}
      <div className="caesar-card">
        <div className="flex items-center gap-2 mb-5">
          <PieIcon size={18} style={{ color: '#00CFFF' }} />
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Venture P&amp;L
          </h3>
        </div>

        {ventureFinancials.length > 0 && (
          <div className="flex gap-2 mb-5 flex-wrap">
            {ventureFinancials.map((v) => (
              <button
                key={v.id}
                onClick={() => setActiveVentureTab(v.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={
                  activeVentureTab === v.id
                    ? { backgroundColor: '#00CFFF', color: '#05080f', fontWeight: 700 }
                    : {
                        backgroundColor: 'var(--bg-elevated)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                      }
                }
              >
                {v.name}
              </button>
            ))}
          </div>
        )}

        {activeVenture ? (
          <div className="space-y-5">
            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderRadius: 12,
                  padding: 12,
                  border: '1px solid var(--border)',
                }}
              >
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Revenue</p>
                <p className="text-lg font-bold text-emerald-400">{fmt$(venturePnL.revenue)}</p>
              </div>
              <div
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderRadius: 12,
                  padding: 12,
                  border: '1px solid var(--border)',
                }}
              >
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Expenses</p>
                <p className="text-lg font-bold text-red-400">{fmt$(venturePnL.expenses)}</p>
              </div>
              <div
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderRadius: 12,
                  padding: 12,
                  border: '1px solid var(--border)',
                }}
              >
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Net Profit</p>
                <p
                  className={`text-lg font-bold ${venturePnL.net >= 0 ? 'text-arc-blue' : 'text-red-400'}`}
                >
                  {fmt$(venturePnL.net)}
                </p>
              </div>
              <div
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderRadius: 12,
                  padding: 12,
                  border: '1px solid var(--border)',
                }}
              >
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>MoM Change</p>
                <div className="flex items-center gap-1">
                  {venturePnL.momChange >= 0 ? (
                    <TrendingUp size={14} className="text-emerald-400" />
                  ) : (
                    <TrendingDown size={14} className="text-red-400" />
                  )}
                  <p
                    className={`text-lg font-bold ${venturePnL.momChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                  >
                    {venturePnL.momChange > 0 ? '+' : ''}{venturePnL.momChange.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            {/* 6-Month Net Chart */}
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                6-Month Net Profit
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={venturePnL.chartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: chartColors.text, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: chartColors.text, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="net"
                    name="Net"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                    fill="#00CFFF"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Venture Transaction List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Transactions
                </p>
                <button
                  onClick={() => openAddTx(activeVenture.id)}
                  className="caesar-btn-ghost flex items-center gap-1 text-xs"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              {ventureTransactions.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                  No transactions logged.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {ventureTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2 group"
                      style={{ backgroundColor: 'var(--bg-elevated)' }}
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          style={{ fontSize: 12, color: 'var(--text-primary)' }}
                          className="truncate"
                        >
                          {tx.description}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {formatDate(tx.date)} · {tx.category}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span
                          className={`text-sm font-semibold ${tx.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}
                        >
                          {tx.type === 'income' ? '+' : '-'}{fmt$(tx.amount)}
                        </span>
                        <button
                          onClick={() => openEditTx(tx, activeVenture.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Edit3 size={11} />
                        </button>
                        <button
                          onClick={() => deleteTx(tx.id, activeVenture.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = '#ef4444';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
            No ventures configured.
          </p>
        )}
      </div>

      {/* ── 6. TRANSACTION LEDGER ─────────────────────────────────────────── */}
      <div className="caesar-card">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <DollarSign size={18} style={{ color: '#00CFFF' }} />
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Transaction Ledger
            </h3>
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                padding: '1px 8px',
              }}
            >
              {filteredLedgerEntries.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToCSV(filteredLedgerEntries)}
              className="caesar-btn-ghost flex items-center gap-1.5"
              style={{ fontSize: 12 }}
            >
              <Download size={13} />
              Export CSV
            </button>
            <button
              onClick={() => openAddTx('global')}
              className="caesar-btn-primary flex items-center gap-1.5"
              style={{ fontSize: 12 }}
            >
              <Plus size={13} />
              Add
            </button>
          </div>
        </div>

        {/* Ledger Filters */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginBottom: 14,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 140 }}>
            <Search
              size={13}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Search transactions..."
              value={ledgerSearch}
              onChange={(e) => setLedgerSearch(e.target.value)}
              className="caesar-input w-full"
              style={{ paddingLeft: 30, fontSize: 12 }}
            />
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1">
            {(['all', 'income', 'expense'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setLedgerTypeFilter(f)}
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                  borderRadius: 20,
                  border: `1px solid ${ledgerTypeFilter === f ? (f === 'income' ? '#22c55e' : f === 'expense' ? '#ef4444' : '#00CFFF') : 'var(--border)'}`,
                  backgroundColor:
                    ledgerTypeFilter === f
                      ? f === 'income'
                        ? 'rgba(34,197,94,0.12)'
                        : f === 'expense'
                        ? 'rgba(239,68,68,0.12)'
                        : 'rgba(0,207,255,0.12)'
                      : 'var(--bg-elevated)',
                  color:
                    ledgerTypeFilter === f
                      ? f === 'income'
                        ? '#22c55e'
                        : f === 'expense'
                        ? '#ef4444'
                        : '#00CFFF'
                      : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: ledgerTypeFilter === f ? 700 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Bank filter */}
          <div className="flex items-center gap-1">
            {([
              { key: 'all', label: 'All Banks' },
              { key: 'afcu', label: 'AFCU' },
              { key: 'mercury', label: 'Mercury' },
            ] as { key: 'all' | 'afcu' | 'mercury'; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setLedgerBankFilter(key)}
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                  borderRadius: 20,
                  border: `1px solid ${
                    ledgerBankFilter === key
                      ? key === 'afcu'
                        ? 'rgba(59,130,246,0.5)'
                        : key === 'mercury'
                        ? 'rgba(20,184,166,0.5)'
                        : 'var(--border)'
                      : 'var(--border)'
                  }`,
                  backgroundColor:
                    ledgerBankFilter === key
                      ? key === 'afcu'
                        ? 'rgba(59,130,246,0.1)'
                        : key === 'mercury'
                        ? 'rgba(20,184,166,0.1)'
                        : 'var(--bg-elevated)'
                      : 'var(--bg-elevated)',
                  color:
                    ledgerBankFilter === key
                      ? key === 'afcu'
                        ? '#60a5fa'
                        : key === 'mercury'
                        ? '#2dd4bf'
                        : 'var(--text-secondary)'
                      : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: ledgerBankFilter === key ? 700 : 400,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Ledger Table */}
        {filteredLedgerEntries.length === 0 ? (
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-muted)',
              textAlign: 'center',
              padding: '32px 0',
            }}
          >
            {financialEntries.length === 0
              ? 'No transactions yet. Import or add one above.'
              : 'No transactions match your filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Description', 'Amount', 'Category', 'Bank', 'Venture', ''].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: h === 'Amount' ? 'right' : h === '' ? 'right' : 'left',
                          padding: '8px 10px',
                          color: 'var(--text-muted)',
                          fontWeight: 600,
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredLedgerEntries.map((tx) => {
                  const venture = ventureFinancials.find((v) => v.id === tx.ventureId);
                  const bank = (tx as any).bank as string | undefined;
                  return (
                    <tr
                      key={tx.id}
                      className="group transition-colors"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                          'var(--bg-elevated)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                          'transparent';
                      }}
                    >
                      <td
                        style={{
                          padding: '10px',
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatDate(tx.date)}
                      </td>
                      <td
                        style={{
                          padding: '10px',
                          color: 'var(--text-primary)',
                          maxWidth: 220,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={tx.description}
                      >
                        {tx.description}
                      </td>
                      <td
                        style={{
                          padding: '10px',
                          textAlign: 'right',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          color: tx.type === 'income' ? '#22c55e' : '#ef4444',
                        }}
                      >
                        {tx.type === 'income' ? '+' : '-'}{fmt$(tx.amount)}
                      </td>
                      <td style={{ padding: '10px', color: 'var(--text-muted)' }}>
                        {tx.category || '—'}
                      </td>
                      <td style={{ padding: '10px' }}>
                        {bank ? <BankBadge bank={bank} /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px', color: 'var(--text-muted)' }}>
                        {venture?.name ?? '—'}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div
                          className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <button
                            onClick={() => openEditTx(tx, 'global')}
                            className="p-1 rounded transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                            }}
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => deleteTx(tx.id, 'global')}
                            className="p-1 rounded transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.color = '#ef4444';
                              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── ADD/EDIT TRANSACTION MODAL ───────────────────────────────────── */}
      <Modal
        isOpen={showTxModal}
        onClose={() => setShowTxModal(false)}
        title={editingTx ? 'Edit Transaction' : 'Add Transaction'}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="caesar-label">Date</label>
              <input
                type="date"
                value={txForm.date}
                onChange={(e) => setTxForm((p) => ({ ...p, date: e.target.value }))}
                className="caesar-input w-full"
              />
            </div>
            <div>
              <label className="caesar-label">Type</label>
              <select
                value={txForm.type}
                onChange={(e) => setTxForm((p) => ({ ...p, type: e.target.value as any }))}
                className="caesar-input w-full"
              >
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
          </div>

          <div>
            <label className="caesar-label">Description</label>
            <input
              type="text"
              value={txForm.description}
              onChange={(e) => setTxForm((p) => ({ ...p, description: e.target.value }))}
              className="caesar-input w-full"
              placeholder="What was this for?"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="caesar-label">Amount ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={txForm.amount}
                onChange={(e) => setTxForm((p) => ({ ...p, amount: e.target.value }))}
                className="caesar-input w-full"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="caesar-label">Category</label>
              <input
                type="text"
                value={txForm.category}
                onChange={(e) => setTxForm((p) => ({ ...p, category: e.target.value }))}
                className="caesar-input w-full"
                placeholder="e.g. Rent, Salary, Tithing"
                list="category-suggestions"
              />
              <datalist id="category-suggestions">
                {uniqueCategories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <div>
            <label className="caesar-label">Venture (optional)</label>
            <select
              value={txForm.ventureId}
              onChange={(e) => setTxForm((p) => ({ ...p, ventureId: e.target.value }))}
              className="caesar-input w-full"
            >
              <option value="">— Personal / No Venture —</option>
              {ventureFinancials.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={saveTx} className="caesar-btn-primary flex-1">
              {editingTx ? 'Save Changes' : 'Add Transaction'}
            </button>
            <button onClick={() => setShowTxModal(false)} className="caesar-btn-ghost flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ── ADD/EDIT SAVINGS GOAL MODAL ──────────────────────────────────── */}
      <Modal
        isOpen={showGoalModal}
        onClose={() => setShowGoalModal(false)}
        title={editingGoal ? 'Edit Savings Goal' : 'Add Savings Goal'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="caesar-label">Goal Name</label>
            <input
              type="text"
              value={goalForm.name}
              onChange={(e) => setGoalForm((p) => ({ ...p, name: e.target.value }))}
              className="caesar-input w-full"
              placeholder="e.g. Emergency Fund, Car"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="caesar-label">Target ($)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={goalForm.target}
                onChange={(e) => setGoalForm((p) => ({ ...p, target: e.target.value }))}
                className="caesar-input w-full"
              />
            </div>
            <div>
              <label className="caesar-label">Current ($)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={goalForm.current}
                onChange={(e) => setGoalForm((p) => ({ ...p, current: e.target.value }))}
                className="caesar-input w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="caesar-label">Deadline</label>
              <input
                type="date"
                value={goalForm.deadline}
                onChange={(e) => setGoalForm((p) => ({ ...p, deadline: e.target.value }))}
                className="caesar-input w-full"
              />
            </div>
            <div>
              <label className="caesar-label">Accent Color</label>
              <input
                type="color"
                value={goalForm.color}
                onChange={(e) => setGoalForm((p) => ({ ...p, color: e.target.value }))}
                className="caesar-input w-full h-10 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={saveGoal} className="caesar-btn-primary flex-1">
              {editingGoal ? 'Save Changes' : 'Add Goal'}
            </button>
            <button onClick={() => setShowGoalModal(false)} className="caesar-btn-ghost flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ── CSV IMPORT MODAL ─────────────────────────────────────────────── */}
      <CSVImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        existingEntries={financialEntries}
        ventureFinancials={ventureFinancials}
        onImport={handleImport}
      />
    </div>
  );
}
