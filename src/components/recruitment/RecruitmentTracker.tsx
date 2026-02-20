import React, { useState, useMemo } from 'react';
import {
  UserPlus,
  Plus,
  Edit3,
  Trash2,
  Mail,
  Search,
  Filter,
  ChevronDown,
  Users,
  TrendingUp,
  CheckSquare,
  Square,
  ArrowRight,
} from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import type { Candidate, CandidateStatus } from '../../types';
import { generateId, todayStr, formatDate } from '../../utils';
import { Modal } from '../shared/Modal';
import { Badge, StatusBadge } from '../shared/Badge';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const PIPELINE_STAGES: { key: CandidateStatus; label: string; color: string }[] = [
  { key: 'contacted',   label: 'Contacted',   color: '#3b82f6' },
  { key: 'interviewed', label: 'Interviewed', color: '#f59e0b' },
  { key: 'offered',     label: 'Offered',     color: '#8b5cf6' },
  { key: 'joined',      label: 'Joined',      color: '#22c55e' },
  { key: 'declined',    label: 'Declined',    color: '#ef4444' },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function daysAgoLabel(dateStr: string): string {
  try {
    const d = differenceInDays(new Date(), parseISO(dateStr));
    if (d === 0) return 'Today';
    if (d === 1) return '1 day ago';
    return `${d} days ago`;
  } catch {
    return dateStr;
  }
}

function emptyForm(): Omit<Candidate, 'id'> {
  return {
    name: '',
    role: '',
    organization: '',
    status: 'contacted',
    notes: '',
    lastContactDate: todayStr(),
    email: '',
    linkedIn: '',
    linkedVentureId: '',
  };
}

// ─── FUNNEL CHART ─────────────────────────────────────────────────────────────

function FunnelChart({ counts }: { counts: Record<CandidateStatus, number> }) {
  const activePipeline = PIPELINE_STAGES.filter(
    (s) => s.key !== 'declined'
  );
  const maxCount = Math.max(...activePipeline.map((s) => counts[s.key]), 1);

  return (
    <div className="caesar-card p-5 rounded-2xl">
      <div className="flex items-center gap-2 mb-5">
        <TrendingUp size={18} style={{ color: '#00CFFF' }} />
        <h2 className="text-sm font-semibold text-white">Pipeline Funnel</h2>
      </div>

      <div className="space-y-2">
        {PIPELINE_STAGES.map((stage, idx) => {
          const count = counts[stage.key];
          const widthPct =
            stage.key === 'declined'
              ? 30
              : Math.max(20, (count / maxCount) * 100);
          return (
            <div key={stage.key} className="flex items-center gap-3">
              <div className="w-20 text-right">
                <span className="text-xs text-gray-400">{stage.label}</span>
              </div>
              <div className="flex-1 relative h-8 flex items-center">
                <div
                  className="h-full rounded transition-all duration-500 flex items-center justify-end pr-3"
                  style={{
                    width: `${widthPct}%`,
                    background: `linear-gradient(90deg, ${stage.color}30 0%, ${stage.color}60 100%)`,
                    border: `1px solid ${stage.color}50`,
                  }}
                >
                  <span
                    className="text-xs font-bold"
                    style={{ color: stage.color }}
                  >
                    {count}
                  </span>
                </div>
              </div>
              {idx < PIPELINE_STAGES.length - 2 && (
                <ArrowRight size={12} className="text-gray-600" />
              )}
              {idx === PIPELINE_STAGES.length - 2 && (
                <span className="text-gray-600 text-xs w-4" />
              )}
            </div>
          );
        })}
      </div>

      {/* Declined row separate */}
      <div className="mt-3 pt-3 border-t border-navy-700 flex items-center gap-3">
        <div className="w-20 text-right">
          <span className="text-xs text-gray-500">Declined</span>
        </div>
        <div className="flex-1">
          <div
            className="h-6 rounded flex items-center justify-end pr-3"
            style={{
              width: `${Math.max(8, (counts.declined / Math.max(counts.contacted, 1)) * 100)}%`,
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.3)',
              maxWidth: '40%',
            }}
          >
            <span className="text-xs font-bold text-red-400">{counts.declined}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface Props {
  candidates: Candidate[];
  setCandidates: (v: Candidate[] | ((p: Candidate[]) => Candidate[])) => void;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export function RecruitmentTracker({ candidates, setCandidates }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [form, setForm] = useState<Omit<Candidate, 'id'>>(emptyForm());

  const [searchQuery, setSearchQuery] = useState('');
  const [filterOrg, setFilterOrg] = useState('all');
  const [filterStatus, setFilterStatus] = useState<CandidateStatus | 'all'>('all');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<CandidateStatus>('interviewed');

  // ── Derived data ───────────────────────────────────────────────────────────

  const orgs = useMemo(() => {
    const set = new Set(candidates.map((c) => c.organization).filter(Boolean));
    return Array.from(set).sort();
  }, [candidates]);

  const stageCounts = useMemo(() => {
    return PIPELINE_STAGES.reduce<Record<CandidateStatus, number>>(
      (acc, s) => {
        acc[s.key] = candidates.filter((c) => c.status === s.key).length;
        return acc;
      },
      { contacted: 0, interviewed: 0, offered: 0, joined: 0, declined: 0 }
    );
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return candidates.filter((c) => {
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q) ||
        c.organization.toLowerCase().includes(q);
      const matchesOrg = filterOrg === 'all' || c.organization === filterOrg;
      const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
      return matchesSearch && matchesOrg && matchesStatus;
    });
  }, [candidates, searchQuery, filterOrg, filterStatus]);

  const stats = useMemo(() => {
    const total = candidates.length;
    const active = candidates.filter(
      (c) => c.status !== 'joined' && c.status !== 'declined'
    ).length;
    const joined = candidates.filter((c) => c.status === 'joined').length;
    const conversionRate =
      total > 0 ? Math.round((joined / total) * 100) : 0;

    const orgBreakdown = orgs.map((org) => ({
      org,
      count: candidates.filter((c) => c.organization === org).length,
    }));

    return { total, active, joined, conversionRate, orgBreakdown };
  }, [candidates, orgs]);

  // ── Modal ─────────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingCandidate(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(candidate: Candidate) {
    setEditingCandidate(candidate);
    setForm({ ...candidate });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingCandidate(null);
  }

  function saveCandidate() {
    if (!form.name.trim()) return;
    if (editingCandidate) {
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === editingCandidate.id ? { ...form, id: editingCandidate.id } : c
        )
      );
    } else {
      setCandidates((prev) => [...prev, { ...form, id: generateId() }]);
    }
    closeModal();
  }

  function deleteCandidate(id: string) {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function quickUpdateStatus(id: string, status: CandidateStatus) {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status } : c))
    );
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredCandidates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCandidates.map((c) => c.id)));
    }
  }

  function applyBulkStatus() {
    if (selectedIds.size === 0) return;
    setCandidates((prev) =>
      prev.map((c) => (selectedIds.has(c.id) ? { ...c, status: bulkStatus } : c))
    );
    setSelectedIds(new Set());
  }

  // ── Render card ───────────────────────────────────────────────────────────

  function renderCandidateCard(c: Candidate) {
    const isSelected = selectedIds.has(c.id);
    const stageConfig =
      PIPELINE_STAGES.find((s) => s.key === c.status) ?? PIPELINE_STAGES[0];

    return (
      <div
        key={c.id}
        className={`caesar-card p-4 rounded-xl border transition-all duration-200 ${
          isSelected
            ? 'border-arc-blue/60'
            : 'border-navy-600 hover:border-navy-500'
        }`}
        style={{ background: 'rgba(13,20,40,0.9)' }}
      >
        {/* Top row */}
        <div className="flex items-start gap-2 mb-2">
          <button
            onClick={() => toggleSelect(c.id)}
            className="mt-0.5 text-gray-500 hover:text-arc-blue transition-colors shrink-0"
          >
            {isSelected ? (
              <CheckSquare size={16} style={{ color: '#00CFFF' }} />
            ) : (
              <Square size={16} />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-white font-semibold text-sm leading-tight truncate">
                  {c.name}
                </h3>
                <p className="text-gray-400 text-xs mt-0.5 truncate">{c.role}</p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <StatusBadge status={c.status} />
                {c.organization && (
                  <Badge
                    label={c.organization}
                    color="#FFD700"
                    size="xs"
                    variant="outline"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Last contact */}
        <div className="flex items-center gap-1 mb-2 ml-6">
          <span className="text-gray-500 text-xs">Last contact:</span>
          <span className="text-gray-400 text-xs">{formatDate(c.lastContactDate)}</span>
          <span
            className="text-xs font-medium ml-1"
            style={{ color: stageConfig.color }}
          >
            ({daysAgoLabel(c.lastContactDate)})
          </span>
        </div>

        {/* Notes preview */}
        {c.notes && (
          <p className="text-gray-500 text-xs line-clamp-2 ml-6 mb-2">{c.notes}</p>
        )}

        {/* Links */}
        {(c.email || c.linkedIn) && (
          <div className="flex items-center gap-3 ml-6 mb-2">
            {c.email && (
              <a
                href={`mailto:${c.email}`}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-arc-blue transition-colors"
              >
                <Mail size={12} />
                <span className="truncate max-w-[120px]">{c.email}</span>
              </a>
            )}
            {c.linkedIn && (
              <a
                href={c.linkedIn.startsWith('http') ? c.linkedIn : `https://${c.linkedIn}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-arc-blue transition-colors"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                  <rect x="2" y="9" width="4" height="12" />
                  <circle cx="4" cy="4" r="2" />
                </svg>
                <span>LinkedIn</span>
              </a>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-navy-700 ml-6">
          <div className="flex items-center gap-1">
            <button
              onClick={() => openEdit(c)}
              className="p-1 text-gray-400 hover:text-arc-blue transition-colors rounded"
              title="Edit"
            >
              <Edit3 size={13} />
            </button>
            <button
              onClick={() => deleteCandidate(c.id)}
              className="p-1 text-gray-400 hover:text-red-400 transition-colors rounded"
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {/* Quick status */}
          <div className="relative">
            <select
              value={c.status}
              onChange={(e) =>
                quickUpdateStatus(c.id, e.target.value as CandidateStatus)
              }
              className="text-xs rounded px-2 py-1 border appearance-none cursor-pointer pr-6"
              style={{
                background: `${stageConfig.color}15`,
                borderColor: `${stageConfig.color}40`,
                color: stageConfig.color,
              }}
            >
              {PIPELINE_STAGES.map((s) => (
                <option
                  key={s.key}
                  value={s.key}
                  style={{ background: '#0d1428', color: '#fff' }}
                >
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={10}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: stageConfig.color }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <UserPlus size={22} style={{ color: '#00CFFF' }} />
            Recruitment Tracker
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Build your team pipeline</p>
        </div>
        <button onClick={openAdd} className="caesar-btn-primary flex items-center gap-2">
          <Plus size={16} />
          Add Candidate
        </button>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Candidates',
            value: stats.total,
            icon: <Users size={16} />,
            color: '#00CFFF',
          },
          {
            label: 'Active Pipeline',
            value: stats.active,
            icon: <TrendingUp size={16} />,
            color: '#FFD700',
          },
          {
            label: 'Joined',
            value: stats.joined,
            icon: <UserPlus size={16} />,
            color: '#22c55e',
          },
          {
            label: 'Conversion Rate',
            value: `${stats.conversionRate}%`,
            icon: <ArrowRight size={16} />,
            color: '#8b5cf6',
          },
        ].map((s) => (
          <div key={s.label} className="caesar-card p-4 rounded-xl">
            <div className="flex items-center gap-2 mb-1" style={{ color: s.color }}>
              {s.icon}
              <span className="text-xs text-gray-400">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Org breakdown pills ── */}
      {stats.orgBreakdown.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stats.orgBreakdown.map(({ org, count }) => (
            <button
              key={org}
              onClick={() => setFilterOrg(filterOrg === org ? 'all' : org)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                filterOrg === org
                  ? 'bg-gold/20 text-gold border-gold/40'
                  : 'text-gray-400 border-navy-600 hover:text-white'
              }`}
            >
              {org} ({count})
            </button>
          ))}
        </div>
      )}

      {/* ── Funnel chart ── */}
      <FunnelChart counts={stageCounts} />

      {/* ── Filters & search ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            type="text"
            placeholder="Search name, role, org…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="caesar-input pl-9 pr-3 py-2 text-sm w-full rounded-lg"
          />
        </div>

        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <select
            value={filterOrg}
            onChange={(e) => setFilterOrg(e.target.value)}
            className="caesar-input pl-9 pr-8 py-2 text-sm rounded-lg appearance-none"
          >
            <option value="all">All Orgs</option>
            {orgs.map((org) => (
              <option key={org} value={org}>
                {org}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as CandidateStatus | 'all')
            }
            className="caesar-input pr-8 py-2 text-sm rounded-lg appearance-none"
          >
            <option value="all">All Stages</option>
            {PIPELINE_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        </div>
      </div>

      {/* ── Bulk actions ── */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center gap-3 p-3 rounded-xl border border-arc-blue/30 flex-wrap"
          style={{ background: 'rgba(0,207,255,0.05)' }}
        >
          <span className="text-arc-blue text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">Move to:</span>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as CandidateStatus)}
              className="caesar-input py-1 text-sm rounded-lg"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <button onClick={applyBulkStatus} className="caesar-btn-primary py-1 px-3 text-sm">
              Apply
            </button>
          </div>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="caesar-btn-ghost py-1 px-3 text-sm ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Select all + count ── */}
      <div className="flex items-center justify-between">
        <button
          onClick={toggleSelectAll}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          {selectedIds.size === filteredCandidates.length && filteredCandidates.length > 0 ? (
            <CheckSquare size={15} style={{ color: '#00CFFF' }} />
          ) : (
            <Square size={15} />
          )}
          Select all
        </button>
        <span className="text-gray-500 text-sm">
          {filteredCandidates.length} candidate{filteredCandidates.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Candidate grid ── */}
      {filteredCandidates.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p>No candidates found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCandidates.map((c) => renderCandidateCard(c))}
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingCandidate ? 'Edit Candidate' : 'Add Candidate'}
        size="lg"
      >
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="caesar-label">Name *</label>
            <input
              type="text"
              className="caesar-input w-full mt-1"
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* Role */}
          <div>
            <label className="caesar-label">Role / Position</label>
            <input
              type="text"
              className="caesar-input w-full mt-1"
              placeholder="e.g. Software Engineer, Marketing Lead"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            />
          </div>

          {/* Organization & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="caesar-label">Organization</label>
              <input
                type="text"
                className="caesar-input w-full mt-1"
                placeholder="Venture or company"
                value={form.organization}
                onChange={(e) =>
                  setForm((f) => ({ ...f, organization: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="caesar-label">Status</label>
              <select
                className="caesar-input w-full mt-1"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as CandidateStatus }))
                }
              >
                {PIPELINE_STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Last Contact Date */}
          <div>
            <label className="caesar-label">Last Contact Date</label>
            <input
              type="date"
              className="caesar-input w-full mt-1"
              value={form.lastContactDate}
              onChange={(e) =>
                setForm((f) => ({ ...f, lastContactDate: e.target.value }))
              }
            />
          </div>

          {/* Email & LinkedIn */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="caesar-label">Email</label>
              <input
                type="email"
                className="caesar-input w-full mt-1"
                placeholder="email@example.com"
                value={form.email ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="caesar-label">LinkedIn</label>
              <input
                type="text"
                className="caesar-input w-full mt-1"
                placeholder="linkedin.com/in/username"
                value={form.linkedIn ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, linkedIn: e.target.value }))}
              />
            </div>
          </div>

          {/* Linked Venture */}
          <div>
            <label className="caesar-label">Linked Venture ID (optional)</label>
            <input
              type="text"
              className="caesar-input w-full mt-1"
              placeholder="Venture or project ID"
              value={form.linkedVentureId ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, linkedVentureId: e.target.value }))
              }
            />
          </div>

          {/* Notes */}
          <div>
            <label className="caesar-label">Notes</label>
            <textarea
              className="caesar-input w-full mt-1 resize-none"
              rows={4}
              placeholder="Background, interview notes, impressions…"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={saveCandidate}
              disabled={!form.name.trim()}
              className="caesar-btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingCandidate ? 'Save Changes' : 'Add Candidate'}
            </button>
            <button onClick={closeModal} className="caesar-btn-ghost flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
