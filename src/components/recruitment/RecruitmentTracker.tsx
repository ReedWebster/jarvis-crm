import React, { useState, useMemo } from 'react';
import {
  Building2, Plus, Edit3, Trash2, Mail, Phone, Search,
  CheckCircle2, Clock, AlertCircle, Users, Bell,
  CreditCard, FileText, Briefcase, RefreshCw,
} from 'lucide-react';
import { differenceInDays } from 'date-fns';
import type { Client, ClientPayment, ClientStatus, PaymentStatus } from '../../types';
import { generateId, todayStr, formatDate } from '../../utils';
import { Modal } from '../shared/Modal';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CLIENT_STATUSES: { key: ClientStatus; label: string; color: string }[] = [
  { key: 'prospect',  label: 'Prospect',  color: '#6b7280' },
  { key: 'active',    label: 'Active',    color: '#10b981' },
  { key: 'paused',    label: 'Paused',    color: '#d97706' },
  { key: 'completed', label: 'Completed', color: '#3b82f6' },
];

const PAYMENT_STATUSES: { key: PaymentStatus; label: string; color: string }[] = [
  { key: 'pending', label: 'Pending', color: '#d97706' },
  { key: 'paid',    label: 'Paid',    color: '#10b981' },
  { key: 'overdue', label: 'Overdue', color: '#ef4444' },
];

const SERVICES = [
  'Social Media Management', 'Paid Ads (PPC)', 'SEO / SEM',
  'Email Marketing', 'Content Creation', 'Branding',
  'Web Design', 'Analytics & Reporting', 'Full-Service', 'Consulting', 'Other',
];

const BILLING_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Handles old localStorage/Supabase data that may have `service: string` instead of `services: string[]` */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeClient(c: any): Client {
  return {
    ...c,
    services: Array.isArray(c.services) ? c.services : c.service ? [c.service] : [],
    payments: Array.isArray(c.payments) ? c.payments : [],
    name: c.name ?? '',
    company: c.company ?? '',
    status: c.status ?? 'prospect',
    contractValue: Number(c.contractValue) || 0,
    startDate: c.startDate ?? '',
    notes: c.notes ?? '',
  };
}

function fmtUSD(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function effectivePaymentStatus(p: ClientPayment): PaymentStatus {
  if (p.status === 'paid') return 'paid';
  if (p.dueDate < todayStr()) return 'overdue';
  return 'pending';
}

function nextDuePayment(client: Client): ClientPayment | null {
  const pending = client.payments
    .filter(p => p.status !== 'paid')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return pending[0] ?? null;
}

function ordinal(n: number): string {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function emptyClient(): Omit<Client, 'id'> {
  return {
    name: '', company: '', email: '', phone: '',
    status: 'prospect', services: [], contractValue: 0,
    billingDay: undefined, startDate: todayStr(), endDate: '', notes: '', payments: [],
  };
}

function emptyPayment(): Omit<ClientPayment, 'id'> {
  return { description: '', amount: 0, dueDate: todayStr(), status: 'pending' };
}

// ─── BADGES ──────────────────────────────────────────────────────────────────

function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const cfg = CLIENT_STATUSES.find(s => s.key === status)!;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
      style={{ backgroundColor: `${cfg.color}20`, color: cfg.color, border: `1px solid ${cfg.color}40` }}>
      {cfg.label}
    </span>
  );
}

function PaymentStatusBadge({ payment }: { payment: ClientPayment }) {
  const status = effectivePaymentStatus(payment);
  const cfg = PAYMENT_STATUSES.find(s => s.key === status)!;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
      style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ─── CLIENT CARD ─────────────────────────────────────────────────────────────

function ClientCard({ client, onEdit, onDelete }: { client: Client; onEdit: () => void; onDelete: () => void }) {
  const paid = client.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const outstanding = client.payments.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
  const next = nextDuePayment(client);
  const hasOverdue = client.payments.some(p => effectivePaymentStatus(p) === 'overdue');

  return (
    <div
      className="caesar-card p-4 rounded-xl border transition-all duration-200 hover:border-[var(--border-strong)] flex flex-col gap-3"
      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: hasOverdue ? 'rgba(239,68,68,0.3)' : 'var(--border)' }}
    >
      {/* Header — company is primary */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
            {client.company || client.name}
          </h3>
          {client.company && client.name && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{client.name}</p>
          )}
        </div>
        <ClientStatusBadge status={client.status} />
      </div>

      {/* Services */}
      {client.services.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {client.services.map(s => (
            <span key={s} className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Payment summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-card)' }}>
          <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Paid</div>
          <div className="text-sm font-semibold" style={{ color: '#10b981' }}>{fmtUSD(paid)}</div>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-card)' }}>
          <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Outstanding</div>
          <div className="text-sm font-semibold" style={{ color: outstanding > 0 ? (hasOverdue ? '#ef4444' : '#d97706') : 'var(--text-muted)' }}>
            {fmtUSD(outstanding)}
          </div>
        </div>
      </div>

      {/* Next due */}
      {next && (
        <div className="flex items-center gap-1.5 text-xs"
          style={{ color: effectivePaymentStatus(next) === 'overdue' ? '#ef4444' : 'var(--text-muted)' }}>
          {effectivePaymentStatus(next) === 'overdue' ? <AlertCircle size={11} /> : <Clock size={11} />}
          {effectivePaymentStatus(next) === 'overdue' ? 'Overdue: ' : 'Next due: '}
          {next.description} — {fmtUSD(next.amount)} on {formatDate(next.dueDate)}
        </div>
      )}

      {/* Billing cycle */}
      {client.billingDay && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Bell size={11} /> Bills on the {ordinal(client.billingDay)} · {fmtUSD(client.contractValue)}/mo
        </div>
      )}

      {/* Contact */}
      {(client.email || client.phone) && (
        <div className="flex items-center gap-3 flex-wrap">
          {client.email && (
            <a href={`mailto:${client.email}`} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Mail size={11} /><span className="truncate max-w-[140px]">{client.email}</span>
            </a>
          )}
          {client.phone && (
            <a href={`tel:${client.phone}`} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Phone size={11} />{client.phone}
            </a>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} title="Edit">
            <Edit3 size={13} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} title="Delete">
            <Trash2 size={13} />
          </button>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {client.payments.length} payment{client.payments.length !== 1 ? 's' : ''}
          {client.contractValue > 0 && ` · ${fmtUSD(client.contractValue)}/mo`}
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENT ROW ─────────────────────────────────────────────────────────────

function PaymentRow({ payment, onMarkPaid, onDelete }: { payment: ClientPayment; onMarkPaid: () => void; onDelete: () => void }) {
  const effectiveStatus = effectivePaymentStatus(payment);
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: effectiveStatus === 'overdue' ? 'rgba(239,68,68,0.3)' : 'var(--border)' }}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{payment.description || 'Payment'}</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Due {formatDate(payment.dueDate)}
          {payment.paidDate && ` · Paid ${formatDate(payment.paidDate)}`}
        </div>
      </div>
      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtUSD(payment.amount)}</div>
      <PaymentStatusBadge payment={payment} />
      {payment.status !== 'paid' && (
        <button onClick={onMarkPaid} className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: '#10b981' }} title="Mark as paid">
          <CheckCircle2 size={14} />
        </button>
      )}
      <button onClick={onDelete} className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)]"
        style={{ color: 'var(--text-muted)' }} title="Delete">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface Props {
  clients: Client[];
  setClients: (v: Client[] | ((p: Client[]) => Client[])) => void;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export function RecruitmentTracker({ clients: rawClients, setClients }: Props) {
  // Normalize to handle any stale/malformed data from older versions
  const clients = (Array.isArray(rawClients) ? rawClients : []).map(normalizeClient);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<Omit<Client, 'id'>>(emptyClient());
  const [tab, setTab] = useState<'details' | 'payments' | 'notes'>('details');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<ClientStatus | 'all'>('all');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState<Omit<ClientPayment, 'id'>>(emptyPayment());

  // ── Derived stats ──────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const active = clients.filter(c => c.status === 'active').length;
    const allPayments = clients.flatMap(c => c.payments);
    const totalPaid = allPayments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const totalOutstanding = allPayments.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
    const overdueCount = allPayments.filter(p => effectivePaymentStatus(p) === 'overdue').length;
    const contracted = clients.filter(c => c.status === 'active').reduce((s, c) => s + c.contractValue, 0);
    return { active, totalPaid, totalOutstanding, overdueCount, contracted };
  }, [clients]);

  // ── Monthly billing reminders ──────────────────────────────────────────────

  const billingReminders = useMemo(() => {
    const today = new Date();
    const yr = today.getFullYear();
    const mo = String(today.getMonth() + 1).padStart(2, '0');
    const thisMonth = `${yr}-${mo}`;
    const monthName = today.toLocaleString('default', { month: 'long' });

    return clients
      .filter(c => c.status === 'active' && c.contractValue > 0 && c.billingDay)
      .map(c => {
        const day = String(c.billingDay!).padStart(2, '0');
        const dueDate = `${thisMonth}-${day}`;
        const alreadyInvoiced = c.payments.some(p => p.dueDate.startsWith(thisMonth));
        const daysUntilDue = differenceInDays(new Date(dueDate), today);
        return { client: c, dueDate, alreadyInvoiced, daysUntilDue, monthName, yr };
      })
      .filter(r => !r.alreadyInvoiced)
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }, [clients]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return clients.filter(c => {
      const matchSearch = !q
        || c.name.toLowerCase().includes(q)
        || c.company.toLowerCase().includes(q)
        || c.services.some(s => s.toLowerCase().includes(q));
      const matchStatus = filterStatus === 'all' || c.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [clients, searchQuery, filterStatus]);

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function openAdd() {
    setEditingClient(null);
    setForm(emptyClient());
    setTab('details');
    setShowPaymentForm(false);
    setModalOpen(true);
  }

  function openEdit(client: Client) {
    setEditingClient(client);
    setForm({ ...client });
    setTab('details');
    setShowPaymentForm(false);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingClient(null);
    setShowPaymentForm(false);
    setPaymentForm(emptyPayment());
  }

  function saveClient() {
    if (!form.name.trim() && !form.company.trim()) return;
    if (editingClient) {
      setClients(prev => prev.map(c => c.id === editingClient.id ? { ...form, id: editingClient.id } : c));
    } else {
      setClients(prev => [...prev, { ...form, id: generateId() }]);
    }
    closeModal();
  }

  function deleteClient(id: string) {
    if (!confirm('Delete this client?')) return;
    setClients(prev => prev.filter(c => c.id !== id));
  }

  // ── Invoice generation ─────────────────────────────────────────────────────

  function generateInvoice(client: Client, dueDate: string, monthName: string, yr: number) {
    const newPmt: ClientPayment = {
      id: generateId(),
      description: `${monthName} ${yr} retainer`,
      amount: client.contractValue,
      dueDate,
      status: 'pending',
    };
    setClients(prev => prev.map(c => c.id === client.id ? { ...c, payments: [...c.payments, newPmt] } : c));
  }

  // ── Payment helpers (inside modal) ────────────────────────────────────────

  function addPayment() {
    if (!paymentForm.description.trim() || paymentForm.amount <= 0) return;
    setForm(f => ({ ...f, payments: [...f.payments, { ...paymentForm, id: generateId() }] }));
    setPaymentForm(emptyPayment());
    setShowPaymentForm(false);
  }

  function markPaymentPaid(pmtId: string) {
    setForm(f => ({
      ...f,
      payments: f.payments.map(p => p.id === pmtId ? { ...p, status: 'paid', paidDate: todayStr() } : p),
    }));
  }

  function deletePayment(pmtId: string) {
    setForm(f => ({ ...f, payments: f.payments.filter(p => p.id !== pmtId) }));
  }

  function toggleService(s: string) {
    setForm(f => ({
      ...f,
      services: f.services.includes(s) ? f.services.filter(x => x !== s) : [...f.services, s],
    }));
  }

  const paymentsTotal = form.payments.reduce((s, p) => s + p.amount, 0);
  const paymentsPaid = form.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Building2 size={22} style={{ color: 'var(--text-muted)' }} />
            Clients
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Vanta Marketing Co. · Client & payment tracker</p>
        </div>
        <button onClick={openAdd} className="caesar-btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Client
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Active Clients',   value: String(stats.active),           icon: <Users size={16} />,        color: '#10b981' },
          { label: 'Monthly Revenue',  value: fmtUSD(stats.contracted),       icon: <Briefcase size={16} />,    color: 'var(--text-muted)' },
          { label: 'Paid to Date',     value: fmtUSD(stats.totalPaid),        icon: <CheckCircle2 size={16} />, color: '#10b981' },
          { label: 'Outstanding',      value: fmtUSD(stats.totalOutstanding), icon: <AlertCircle size={16} />,  color: stats.overdueCount > 0 ? '#ef4444' : '#d97706' },
        ].map(s => (
          <div key={s.label} className="caesar-card p-4 rounded-xl">
            <div className="flex items-center gap-2 mb-1" style={{ color: s.color }}>
              {s.icon}
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Monthly billing reminders */}
      {billingReminders.length > 0 && (
        <div className="rounded-xl border p-4 space-y-3"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: billingReminders.some(r => r.daysUntilDue < 0) ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.3)' }}>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            <Bell size={15} style={{ color: billingReminders.some(r => r.daysUntilDue < 0) ? '#ef4444' : '#d97706' }} />
            Billing Reminders
            <span className="ml-auto text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
              {billingReminders.length} invoice{billingReminders.length !== 1 ? 's' : ''} not yet generated this month
            </span>
          </div>
          <div className="space-y-2">
            {billingReminders.map(({ client, dueDate, daysUntilDue, monthName, yr }) => {
              const isOverdue = daysUntilDue < 0;
              const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 5;
              const color = isOverdue ? '#ef4444' : isDueSoon ? '#d97706' : 'var(--text-muted)';
              return (
                <div key={client.id} className="flex items-center gap-3 rounded-lg p-3"
                  style={{ backgroundColor: 'var(--bg-card)', border: `1px solid ${isOverdue ? 'rgba(239,68,68,0.2)' : 'var(--border)'}` }}>
                  <div style={{ color }}>
                    {isOverdue ? <AlertCircle size={14} /> : <Clock size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {client.company || client.name}
                    </span>
                    <span className="text-xs ml-2" style={{ color }}>
                      {isOverdue
                        ? `Invoice overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? 's' : ''}`
                        : daysUntilDue === 0
                          ? 'Invoice due today'
                          : `Invoice due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`
                      }
                    </span>
                  </div>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {fmtUSD(client.contractValue)}
                  </span>
                  <button
                    onClick={() => generateInvoice(client, dueDate, monthName, yr)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:border-[var(--border-strong)]"
                    style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    <RefreshCw size={11} /> Generate
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', ...CLIENT_STATUSES.map(s => s.key)] as (ClientStatus | 'all')[]).map(key => {
          const cfg = CLIENT_STATUSES.find(s => s.key === key);
          const count = key === 'all' ? clients.length : clients.filter(c => c.status === key).length;
          return (
            <button key={key} onClick={() => setFilterStatus(key)}
              className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
              style={{
                backgroundColor: filterStatus === key ? (cfg ? `${cfg.color}20` : 'var(--bg-elevated)') : 'transparent',
                borderColor: filterStatus === key ? (cfg ? `${cfg.color}40` : 'var(--border)') : 'var(--border)',
                color: filterStatus === key ? (cfg ? cfg.color : 'var(--text-primary)') : 'var(--text-muted)',
              }}>
              {key === 'all' ? 'All' : cfg!.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input className="caesar-input pl-9 w-full" placeholder="Search by name, company, or service…"
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </div>

      {/* Client grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>{clients.length === 0 ? 'No clients yet. Add your first client.' : 'No clients match your filters.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(c => (
            <ClientCard key={c.id} client={c} onEdit={() => openEdit(c)} onDelete={() => deleteClient(c.id)} />
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingClient ? `Edit · ${editingClient.company || editingClient.name}` : 'Add Client'}
        size="lg"
      >
        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b" style={{ borderColor: 'var(--border)' }}>
          {([
            { key: 'details',  label: 'Details',  icon: <Users size={13} /> },
            { key: 'payments', label: 'Payments', icon: <CreditCard size={13} /> },
            { key: 'notes',    label: 'Notes',    icon: <FileText size={13} /> },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors"
              style={{
                borderColor: tab === t.key ? 'var(--text-primary)' : 'transparent',
                color: tab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── Details Tab ── */}
        {tab === 'details' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="caesar-label">Company *</label>
                <input className="caesar-input w-full mt-1" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Business name" autoFocus />
              </div>
              <div>
                <label className="caesar-label">Contact Name</label>
                <input className="caesar-input w-full mt-1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Primary contact" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="caesar-label">Email</label>
                <input type="email" className="caesar-input w-full mt-1" value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
              </div>
              <div>
                <label className="caesar-label">Phone</label>
                <input type="tel" className="caesar-input w-full mt-1" value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 000-0000" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="caesar-label">Status</label>
                <select className="caesar-select w-full mt-1" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ClientStatus }))}>
                  {CLIENT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="caesar-label">Start Date</label>
                <input type="date" className="caesar-input w-full mt-1" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
            </div>

            {/* Services multi-select */}
            <div>
              <label className="caesar-label">Services</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {SERVICES.map(s => {
                  const selected = form.services.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleService(s)}
                      className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-all"
                      style={{
                        backgroundColor: selected ? 'var(--bg-elevated)' : 'transparent',
                        borderColor: selected ? 'var(--border-strong)' : 'var(--border)',
                        color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="caesar-label">Monthly Contract Value ($)</label>
                <input type="number" min={0} className="caesar-input w-full mt-1"
                  value={form.contractValue || ''}
                  onChange={e => setForm(f => ({ ...f, contractValue: parseFloat(e.target.value) || 0 }))}
                  placeholder="0" />
              </div>
              <div>
                <label className="caesar-label">Invoice Day of Month</label>
                <select className="caesar-select w-full mt-1" value={form.billingDay ?? ''}
                  onChange={e => setForm(f => ({ ...f, billingDay: e.target.value ? parseInt(e.target.value) : undefined }))}>
                  <option value="">No recurring billing</option>
                  {BILLING_DAYS.map(d => <option key={d} value={d}>{ordinal(d)} of each month</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="caesar-label">End Date (optional)</label>
              <input type="date" className="caesar-input w-full mt-1" value={form.endDate ?? ''} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
        )}

        {/* ── Payments Tab ── */}
        {tab === 'payments' && (
          <div className="space-y-4">
            {form.payments.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total',     value: fmtUSD(paymentsTotal),                  color: 'var(--text-primary)' },
                  { label: 'Paid',      value: fmtUSD(paymentsPaid),                   color: '#10b981' },
                  { label: 'Remaining', value: fmtUSD(paymentsTotal - paymentsPaid),   color: paymentsTotal - paymentsPaid > 0 ? '#d97706' : 'var(--text-muted)' },
                ].map(s => (
                  <div key={s.label} className="rounded-lg p-3 text-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                    <div className="text-sm font-bold" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {form.payments.length === 0 && !showPaymentForm && (
                <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No payments yet.</p>
              )}
              {[...form.payments].sort((a, b) => b.dueDate.localeCompare(a.dueDate)).map(p => (
                <PaymentRow key={p.id} payment={p} onMarkPaid={() => markPaymentPaid(p.id)} onDelete={() => deletePayment(p.id)} />
              ))}
            </div>

            {showPaymentForm ? (
              <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>New Payment</div>
                <div>
                  <label className="caesar-label">Description</label>
                  <input className="caesar-input w-full mt-1" value={paymentForm.description}
                    onChange={e => setPaymentForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. March retainer, Ad spend invoice…" autoFocus />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="caesar-label">Amount ($)</label>
                    <input type="number" min={0} className="caesar-input w-full mt-1"
                      value={paymentForm.amount || ''}
                      onChange={e => setPaymentForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                      placeholder="0" />
                  </div>
                  <div>
                    <label className="caesar-label">Due Date</label>
                    <input type="date" className="caesar-input w-full mt-1" value={paymentForm.dueDate}
                      onChange={e => setPaymentForm(f => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="caesar-label">Status</label>
                  <select className="caesar-select w-full mt-1" value={paymentForm.status}
                    onChange={e => setPaymentForm(f => ({ ...f, status: e.target.value as PaymentStatus }))}>
                    {PAYMENT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={addPayment} disabled={!paymentForm.description.trim() || paymentForm.amount <= 0}
                    className="caesar-btn-primary flex-1 disabled:opacity-50">Add Payment</button>
                  <button onClick={() => { setShowPaymentForm(false); setPaymentForm(emptyPayment()); }} className="caesar-btn-ghost">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowPaymentForm(true)}
                className="w-full py-2.5 rounded-lg border border-dashed text-xs flex items-center justify-center gap-1.5 transition-colors hover:bg-[var(--bg-hover)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                <Plus size={13} /> Add Payment
              </button>
            )}
          </div>
        )}

        {/* ── Notes Tab ── */}
        {tab === 'notes' && (
          <div>
            <label className="caesar-label">Client Notes</label>
            <textarea className="caesar-textarea w-full mt-1" rows={10}
              placeholder="Contract details, communication history, preferences, next steps…"
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        )}

        <div className="flex gap-3 pt-4 mt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={saveClient} disabled={!form.name.trim() && !form.company.trim()}
            className="caesar-btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed">
            {editingClient ? 'Save Changes' : 'Add Client'}
          </button>
          <button onClick={closeModal} className="caesar-btn-ghost flex-1">Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
