import React, { useState, useMemo } from 'react';
import {
  Zap, Plus, Edit3, Trash2, Play, Pause, Search,
  ArrowRight, Clock, CheckCircle2, AlertCircle,
} from 'lucide-react';
import type { AutomationRule, AutomationTrigger, AutomationAction } from '../../types';
import { generateId } from '../../utils';
import { Modal } from '../shared/Modal';
import { format, parseISO } from 'date-fns';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  rules: AutomationRule[];
  setRules: (v: AutomationRule[] | ((p: AutomationRule[]) => AutomationRule[])) => void;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TRIGGERS: { value: AutomationTrigger; label: string; description: string }[] = [
  { value: 'new-contact',   label: 'New Contact Added',    description: 'When a new contact is created' },
  { value: 'meeting-ended', label: 'Meeting Ended',        description: 'After a scheduled meeting time passes' },
  { value: 'todo-overdue',  label: 'Todo Overdue',         description: 'When a todo passes its due date' },
  { value: 'goal-stalled',  label: 'Goal Stalled',         description: 'When a goal has no progress for 7+ days' },
  { value: 'follow-up-due', label: 'Follow-up Due',        description: 'When a contact follow-up date arrives' },
  { value: 'habit-missed',  label: 'Habit Missed',         description: 'When a daily habit is not completed' },
  { value: 'custom',        label: 'Custom Trigger',       description: 'Define your own trigger condition' },
];

const ACTIONS: { value: AutomationAction; label: string; description: string }[] = [
  { value: 'create-todo',       label: 'Create Todo',          description: 'Automatically create a new todo item' },
  { value: 'create-note',       label: 'Create Note',          description: 'Generate a note with context' },
  { value: 'send-notification', label: 'Send Notification',    description: 'Push a notification alert' },
  { value: 'update-status',     label: 'Update Status',        description: 'Change the status of an item' },
  { value: 'tag-contact',       label: 'Tag Contact',          description: 'Add a tag to a contact' },
  { value: 'custom',            label: 'Custom Action',        description: 'Define your own action' },
];

function emptyRule(): AutomationRule {
  return {
    id: generateId(),
    name: '',
    description: '',
    trigger: 'new-contact',
    triggerConfig: {},
    action: 'create-todo',
    actionConfig: {},
    enabled: true,
    runCount: 0,
    createdAt: new Date().toISOString(),
  };
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export function AutomationWorkflows({ rules, setRules }: Props) {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [draft, setDraft] = useState<AutomationRule>(emptyRule);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rules.filter(r => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
  }, [rules, search]);

  const activeCount = useMemo(() => rules.filter(r => r.enabled).length, [rules]);
  const totalRuns = useMemo(() => rules.reduce((sum, r) => sum + r.runCount, 0), [rules]);

  const openCreate = () => {
    setEditingRule(null);
    setDraft(emptyRule());
    setModalOpen(true);
  };

  const openEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setDraft({ ...rule });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!draft.name.trim()) return;
    if (editingRule) {
      setRules(prev => prev.map(r => r.id === editingRule.id ? { ...draft } : r));
    } else {
      setRules(prev => [...prev, draft]);
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const toggleEnabled = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Rules', value: rules.length, icon: <Zap size={18} /> },
          { label: 'Active', value: activeCount, icon: <Play size={18} /> },
          { label: 'Total Runs', value: totalRuns, icon: <CheckCircle2 size={18} /> },
        ].map(stat => (
          <div key={stat.label} className="caesar-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
              {stat.icon}
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
              <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search automations..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          />
        </div>
        <button onClick={openCreate} className="caesar-btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={14} /> New Rule
        </button>
      </div>

      {/* Rules list */}
      {filtered.length === 0 ? (
        <div className="caesar-card p-12 text-center">
          <Zap size={40} className="mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No automation rules yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Create rules to automate repetitive workflows across your data.</p>
          <button onClick={openCreate} className="caesar-btn-ghost text-xs mt-4 flex items-center gap-1 mx-auto">
            <Plus size={12} /> Create your first rule
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(rule => {
            const triggerMeta = TRIGGERS.find(t => t.value === rule.trigger);
            const actionMeta = ACTIONS.find(a => a.value === rule.action);
            return (
              <div
                key={rule.id}
                className="caesar-card p-4 flex items-center gap-4"
                style={{ opacity: rule.enabled ? 1 : 0.5 }}
              >
                {/* Toggle */}
                <button
                  onClick={() => toggleEnabled(rule.id)}
                  className="flex-shrink-0 w-10 h-6 rounded-full relative transition-colors"
                  style={{ backgroundColor: rule.enabled ? '#22c55e' : 'var(--bg-elevated)' }}
                >
                  <div
                    className="absolute top-1 w-4 h-4 rounded-full transition-all"
                    style={{
                      left: rule.enabled ? 20 : 4,
                      backgroundColor: rule.enabled ? '#fff' : 'var(--text-muted)',
                    }}
                  />
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{rule.name}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)' }}>{triggerMeta?.label ?? rule.trigger}</span>
                    <ArrowRight size={10} />
                    <span className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)' }}>{actionMeta?.label ?? rule.action}</span>
                  </div>
                  {rule.description && (
                    <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{rule.description}</p>
                  )}
                </div>

                {/* Meta */}
                <div className="flex-shrink-0 text-right text-xs" style={{ color: 'var(--text-muted)' }}>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 size={10} /> {rule.runCount} runs
                  </div>
                  {rule.lastTriggeredAt && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock size={10} /> {format(parseISO(rule.lastTriggeredAt), 'MMM d')}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(rule)} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors" style={{ color: 'var(--text-muted)' }}>
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => handleDelete(rule.id)} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors" style={{ color: '#ef4444' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingRule ? 'Edit Rule' : 'New Automation Rule'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Name</label>
            <input
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Auto-create follow-up todo"
              className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Description</label>
            <input
              value={draft.description}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
              placeholder="What does this automation do?"
              className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
          </div>

          {/* Trigger */}
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>When this happens...</label>
            <div className="grid grid-cols-1 gap-2 mt-2">
              {TRIGGERS.map(t => (
                <button
                  key={t.value}
                  onClick={() => setDraft(d => ({ ...d, trigger: t.value }))}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                  style={{
                    backgroundColor: draft.trigger === t.value ? 'var(--bg-elevated)' : 'transparent',
                    border: `1px solid ${draft.trigger === t.value ? 'var(--text-muted)' : 'var(--border)'}`,
                    color: 'var(--text-primary)',
                  }}
                >
                  <Zap size={12} style={{ color: draft.trigger === t.value ? '#22c55e' : 'var(--text-muted)' }} />
                  <div>
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Action */}
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Then do this...</label>
            <div className="grid grid-cols-1 gap-2 mt-2">
              {ACTIONS.map(a => (
                <button
                  key={a.value}
                  onClick={() => setDraft(d => ({ ...d, action: a.value }))}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                  style={{
                    backgroundColor: draft.action === a.value ? 'var(--bg-elevated)' : 'transparent',
                    border: `1px solid ${draft.action === a.value ? 'var(--text-muted)' : 'var(--border)'}`,
                    color: 'var(--text-primary)',
                  }}
                >
                  <ArrowRight size={12} style={{ color: draft.action === a.value ? '#6366f1' : 'var(--text-muted)' }} />
                  <div>
                    <p className="text-sm font-medium">{a.label}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{a.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="caesar-btn-ghost flex-1 py-2 text-sm">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!draft.name.trim()}
              className="caesar-btn-primary flex-1 py-2 text-sm font-medium rounded-lg disabled:opacity-40"
            >
              {editingRule ? 'Save Changes' : 'Create Rule'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
