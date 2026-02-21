import React, { useState, useRef, useCallback } from 'react';
import {
  Edit3,
  Check,
  X,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Camera,
  GripVertical,
} from 'lucide-react';
import type { Identity, StatusMode } from '../../types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  identity: Identity;
  setIdentity: (v: Identity | ((p: Identity) => Identity)) => void;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: StatusMode; label: string; color: string; bg: string }[] = [
  { value: 'deep-work', label: 'Deep Work', color: 'var(--text-muted)',     bg: 'var(--bg-elevated)' },
  { value: 'available', label: 'Available',  color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' },
  { value: 'break',     label: 'On Break',   color: 'var(--text-muted)',     bg: 'var(--bg-elevated)' },
  { value: 'out',       label: 'Out',        color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' },
];

function getStatusConfig(status: StatusMode) {
  return (
    STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0]
  );
}

// ─── Inline editable text ─────────────────────────────────────────────────────

interface InlineEditProps {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  multiline?: boolean;
  displayAs?: 'h1' | 'h2' | 'p' | 'span';
}

function InlineEdit({
  value,
  onSave,
  className = '',
  inputClassName = '',
  placeholder = 'Click to edit...',
  multiline = false,
  displayAs: Tag = 'p',
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function handleSave() {
    const trimmed = draft.trim();
    if (trimmed !== value) onSave(trimmed || value);
    setEditing(false);
  }

  function handleCancel() {
    setDraft(value);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!multiline && e.key === 'Enter') { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') handleCancel();
  }

  if (editing) {
    return (
      <div className="flex items-start gap-1.5">
        {multiline ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={4}
            className={`caesar-input resize-none flex-1 ${inputClassName}`}
            placeholder={placeholder}
          />
        ) : (
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`caesar-input flex-1 ${inputClassName}`}
            placeholder={placeholder}
          />
        )}
        <button
          onClick={handleSave}
          className="p-1.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors flex-shrink-0"
          aria-label="Save"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleCancel}
          className="p-1.5 rounded-lg  transition-colors flex-shrink-0"
          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          aria-label="Cancel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <Tag
      className={`cursor-pointer group flex items-center gap-1.5 ${className}`}
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Click to edit"
    >
      <span>{value || <span className="italic transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>{placeholder}</span>}</span>
      <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
    </Tag>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CoreIdentityPanel({ identity, setIdentity }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const update = useCallback(
    (patch: Partial<Identity>) =>
      setIdentity((prev) => ({ ...prev, ...patch })),
    [setIdentity]
  );

  // ── Photo upload ─────────────────────────────────────────────────────────────

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) update({ photoUrl: dataUrl });
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  }

  // ── Titles (tags) ────────────────────────────────────────────────────────────

  const [newTitle, setNewTitle] = useState('');
  const [addingTitle, setAddingTitle] = useState(false);

  function addTitle() {
    const t = newTitle.trim();
    if (!t) return;
    if (!identity.titles.includes(t)) {
      update({ titles: [...identity.titles, t] });
    }
    setNewTitle('');
    setAddingTitle(false);
  }

  function removeTitle(idx: number) {
    update({ titles: identity.titles.filter((_, i) => i !== idx) });
  }

  // ── Priorities ───────────────────────────────────────────────────────────────

  function updatePriority(idx: number, val: string) {
    const next = [...identity.priorities];
    next[idx] = val;
    update({ priorities: next });
  }

  function movePriorityUp(idx: number) {
    if (idx === 0) return;
    const next = [...identity.priorities];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    update({ priorities: next });
  }

  function movePriorityDown(idx: number) {
    if (idx === identity.priorities.length - 1) return;
    const next = [...identity.priorities];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    update({ priorities: next });
  }

  function addPriority() {
    update({ priorities: [...identity.priorities, ''] });
  }

  function removePriority(idx: number) {
    update({ priorities: identity.priorities.filter((_, i) => i !== idx) });
  }

  // ── Status ───────────────────────────────────────────────────────────────────

  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusCfg = getStatusConfig(identity.status);

  // ── Initials fallback ─────────────────────────────────────────────────────────

  const initials = identity.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'RW';

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="section-title ">Core Identity</h1>

      <div className="grid grid-cols-3 gap-6 items-start">

        {/* ── LEFT: Photo + Status ─────────────────────────────────────────── */}
        <div className="col-span-1 space-y-4">

          {/* Photo circle */}
          <div className="caesar-card flex flex-col items-center gap-4 py-6">
            <div className="relative group">
              <div
                className="w-32 h-32 rounded-full overflow-hidden ring-2 ring-[var(--text-muted)]/40 ring-offset-2 transition-colors duration-300"
                style={{ '--tw-ring-offset-color': 'var(--bg-card)' } as React.CSSProperties}
              >
                {identity.photoUrl ? (
                  <img
                    src={identity.photoUrl}
                    alt={identity.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-3xl font-bold"
                    style={{
                      background: 'var(--bg-elevated)',
                      color: 'var(--bg)',
                    }}
                  >
                    {initials}
                  </div>
                )}
              </div>

              {/* Upload overlay */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Upload photo"
              >
                <Camera className="w-7 h-7 text-white" />
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="caesar-btn-ghost text-xs flex items-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5" />
              {identity.photoUrl ? 'Change Photo' : 'Upload Photo'}
            </button>
          </div>

          {/* Status selector */}
          <div className="caesar-card space-y-3">
            <p className="caesar-label">Current Status</p>

            {/* Active status pill */}
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-300"
                style={{
                  background: statusCfg.bg,
                  borderColor: `${statusCfg.color}50`,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full animate-pulse"
                    style={{ background: statusCfg.color }}
                  />
                  <span
                    className="font-semibold text-sm"
                    style={{ color: statusCfg.color }}
                  >
                    {statusCfg.label}
                  </span>
                </div>
                <Edit3 className="w-3.5 h-3.5 transition-colors duration-300" style={{ color: 'var(--text-muted)' }} />
              </button>

              {/* Dropdown */}
              {showStatusMenu && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 z-20 rounded-xl overflow-hidden border shadow-2xl transition-colors duration-300"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border)',
                  }}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        update({ status: opt.value });
                        setShowStatusMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left duration-300"
                      style={{ backgroundColor: 'transparent' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: opt.color }}
                      />
                      <span
                        className="text-sm font-medium"
                        style={{
                          color:
                            identity.status === opt.value
                              ? opt.color
                              : 'var(--text-muted)',
                        }}
                      >
                        {opt.label}
                      </span>
                      {identity.status === opt.value && (
                        <Check
                          className="w-3.5 h-3.5 ml-auto"
                          style={{ color: opt.color }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Identity details ──────────────────────────────────────── */}
        <div className="col-span-2 space-y-5">

          {/* Name + Role + Titles */}
          <div className="caesar-card space-y-4">

            {/* Name */}
            <div>
              <p className="caesar-label mb-1">Name</p>
              <InlineEdit
                value={identity.name}
                onSave={(v) => update({ name: v })}
                displayAs="h1"
                className="text-2xl font-bold transition-colors duration-300"
                inputClassName="text-xl"
                placeholder="Your name"
              />
            </div>

            {/* Role */}
            <div>
              <p className="caesar-label mb-1">Role / Title</p>
              <InlineEdit
                value={identity.role}
                onSave={(v) => update({ role: v })}
                displayAs="p"
                className="text-[var(--text-muted)] font-medium"
                placeholder="Your primary role"
              />
            </div>

            {/* Titles / Tags */}
            <div>
              <p className="caesar-label mb-2">Tags</p>
              <div className="flex flex-wrap gap-2">
                {identity.titles.map((title, idx) => (
                  <span
                    key={idx}
                    className="group flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)] transition-colors "
                  >
                    {title}
                    <button
                      onClick={() => removeTitle(idx)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-[var(--text-secondary)]"
                      aria-label={`Remove ${title}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {addingTitle ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addTitle();
                        if (e.key === 'Escape') { setNewTitle(''); setAddingTitle(false); }
                      }}
                      placeholder="New tag..."
                      className="caesar-input py-1 px-2 text-xs w-28"
                    />
                    <button
                      onClick={addTitle}
                      className="p-1 rounded-md bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => { setNewTitle(''); setAddingTitle(false); }}
                      className="p-1 rounded-md  transition-colors"
                      style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingTitle(true)}
                    className="flex items-center gap-1 px-3 py-1 rounded-full text-xs border border-dashed   transition-colors duration-300"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    <Plus className="w-3 h-3" />
                    Add tag
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Mission Statement */}
          <div className="caesar-card space-y-3">
            <div className="flex items-center gap-2">
              <p className="caesar-label">Mission Statement</p>
            </div>
            <InlineEdit
              value={identity.missionStatement}
              onSave={(v) => update({ missionStatement: v })}
              displayAs="p"
              multiline
              className="leading-relaxed text-sm transition-colors duration-300"
              inputClassName="text-sm"
              placeholder="Define your mission..."
            />
          </div>

          {/* Top Priorities */}
          <div className="caesar-card space-y-3">
            <p className="caesar-label">Top Priorities</p>

            <div className="space-y-2">
              {identity.priorities.map((priority, idx) => (
                <PriorityCard
                  key={idx}
                  index={idx}
                  value={priority}
                  total={identity.priorities.length}
                  onSave={(v) => updatePriority(idx, v)}
                  onMoveUp={() => movePriorityUp(idx)}
                  onMoveDown={() => movePriorityDown(idx)}
                  onDelete={() => removePriority(idx)}
                />
              ))}
            </div>

            <button
              onClick={addPriority}
              className="caesar-btn-ghost flex items-center gap-1.5 text-sm w-full justify-center py-2 border-dashed border   transition-colors rounded-xl duration-300"
              style={{ borderColor: 'var(--border)' }}
            >
              <Plus className="w-4 h-4" />
              Add Priority
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Priority Card ────────────────────────────────────────────────────────────

interface PriorityCardProps {
  index: number;
  value: string;
  total: number;
  onSave: (v: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

function PriorityCard({
  index,
  value,
  total,
  onSave,
  onMoveUp,
  onMoveDown,
  onDelete,
}: PriorityCardProps) {
  const [editing, setEditing] = useState(!value); // auto-edit if empty
  const [draft, setDraft] = useState(value);

  function handleSave() {
    const trimmed = draft.trim();
    onSave(trimmed || value);
    setEditing(false);
  }

  function handleCancel() {
    if (!value) {
      onDelete();
      return;
    }
    setDraft(value);
    setEditing(false);
  }

  const rankColors = ['#aaaaaa','#888888','#666666','#555555','#444444'];
  const rankColor = rankColors[index] ?? '#6b7280';

  return (
    <div
      className="flex items-center gap-2 group rounded-xl px-3 py-2.5 border transition-all duration-300"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        borderColor: 'var(--border)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-hover)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-hover)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
      }}
    >
      {/* Drag handle (cosmetic) */}
      <GripVertical className="w-4 h-4 flex-shrink-0 cursor-grab transition-colors duration-300" style={{ color: 'var(--text-muted)' }} />

      {/* Rank badge */}
      <span
        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ background: rankColor, color: 'var(--bg)' }}
      >
        {index + 1}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
                if (e.key === 'Escape') handleCancel();
              }}
              className="caesar-input flex-1 py-1 text-sm"
              placeholder="Enter priority..."
            />
            <button
              onClick={handleSave}
              className="p-1 rounded-md bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors flex-shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCancel}
              className="p-1 rounded-md  transition-colors flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            className="text-sm text-left w-full truncate transition-colors flex items-center gap-1.5 group/text duration-300"
            style={{ color: 'var(--text-primary)', opacity: 0.9 }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.9')}
            onClick={() => { setDraft(value); setEditing(true); }}
          >
            <span className="truncate">
              {value || <span className="italic transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>Click to add...</span>}
            </span>
            <Edit3 className="w-3 h-3 opacity-0 group-hover/text:opacity-100 transition-opacity flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          </button>
        )}
      </div>

      {/* Reorder buttons */}
      {!editing && (
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-0.5 rounded  disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Move up"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-0.5 rounded  disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Move down"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Delete */}
      {!editing && (
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-secondary)] hover:text-[var(--text-secondary)] p-0.5 flex-shrink-0"
          aria-label="Delete priority"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
