import React, { useState, useCallback } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  Link,
  Users,
  Calendar,
  ChevronRight,
  Briefcase,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Project, ProjectStatus, HealthColor } from '../../types';
import { generateId, todayStr, formatDate, daysUntil, isOverdue } from '../../utils';
import { Modal } from '../shared/Modal';
import { StatusBadge, HealthDot, Badge } from '../shared/Badge';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Props {
  projects: Project[];
  setProjects: (v: Project[] | ((p: Project[]) => Project[])) => void;
}

interface FormState {
  name: string;
  status: ProjectStatus;
  health: HealthColor;
  nextAction: string;
  dueDate: string;
  keyContacts: string;
  notes: string;
  links: string;
}

// ─── DEFAULTS ─────────────────────────────────────────────────────────────────

const defaultForm: FormState = {
  name: '',
  status: 'active',
  health: 'green',
  nextAction: '',
  dueDate: '',
  keyContacts: '',
  notes: '',
  links: '',
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function projectToForm(p: Project): FormState {
  return {
    name: p.name,
    status: p.status,
    health: p.health,
    nextAction: p.nextAction,
    dueDate: p.dueDate,
    keyContacts: p.keyContacts.join(', '),
    notes: p.notes,
    links: p.links,
  };
}

function DueDateLabel({ dueDate }: { dueDate: string }) {
  if (!dueDate) return null;

  const days = daysUntil(dueDate);
  const overdue = isOverdue(dueDate);
  const formatted = formatDate(dueDate);

  let label = '';
  if (overdue) {
    label = `${Math.abs(days)}d overdue`;
  } else if (days === 0) {
    label = 'Due today';
  } else if (days === 1) {
    label = 'Due tomorrow';
  } else {
    label = `${days}d left`;
  }

  return (
    <div
      className="flex items-center gap-1 text-xs transition-colors duration-300"
      style={{ color: overdue ? '#f87171' : 'var(--text-secondary)' }}
    >
      <Calendar size={11} />
      <span>{formatted}</span>
      <span
        className="ml-1 px-1.5 py-0.5 rounded text-xs font-medium"
        style={
          overdue
            ? { backgroundColor: 'rgba(239,68,68,0.2)', color: '#f87171' }
            : days <= 3
            ? { backgroundColor: 'rgba(234,179,8,0.2)', color: '#facc15' }
            : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }
        }
      >
        {label}
      </span>
    </div>
  );
}

// ─── PROJECT CARD ─────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: Project;
  onEdit: (p: Project) => void;
  onDelete: (id: string) => void;
}

function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
  const contacts = project.keyContacts.filter(Boolean);

  return (
    <div className="caesar-card flex flex-col gap-3 group hover:border-arc-blue/40 transition-colors duration-300">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <HealthDot health={project.health} />
          <h3 className="font-semibold text-sm truncate transition-colors duration-300" style={{ color: 'var(--text-primary)' }}>
            {project.name}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge status={project.status} />
        </div>
      </div>

      {/* Next Action */}
      {project.nextAction && (
        <div className="flex items-start gap-2">
          <ChevronRight size={13} className="text-arc-blue mt-0.5 shrink-0" />
          <p className="text-xs leading-snug line-clamp-2 transition-colors duration-300" style={{ color: 'var(--text-secondary)' }}>
            {project.nextAction}
          </p>
        </div>
      )}

      {/* Due Date */}
      {project.dueDate && <DueDateLabel dueDate={project.dueDate} />}

      {/* Key Contacts */}
      {contacts.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Users size={11} className="shrink-0 transition-colors duration-300" style={{ color: 'var(--text-muted)' }} />
          {contacts.map((c, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 rounded text-xs border transition-colors duration-300"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                borderColor: 'var(--border)',
              }}
            >
              {c.trim()}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {project.notes && (
        <p className="text-xs leading-snug line-clamp-2 italic transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
          {project.notes}
        </p>
      )}

      {/* Links */}
      {project.links && (
        <div className="flex items-center gap-1 text-xs text-arc-blue/70 truncate">
          <Link size={11} className="shrink-0" />
          <span className="truncate">{project.links}</span>
        </div>
      )}

      {/* Actions */}
      <div
        className="flex items-center gap-2 pt-1 border-t mt-auto transition-colors duration-300"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          onClick={() => onEdit(project)}
          className="flex items-center gap-1.5 text-xs hover:text-arc-blue transition-colors px-2 py-1 rounded hover:bg-arc-blue/10 duration-300"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Edit3 size={12} />
          Edit
        </button>
        <button
          onClick={() => onDelete(project.id)}
          className="flex items-center gap-1.5 text-xs hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10 ml-auto duration-300"
          style={{ color: 'var(--text-muted)' }}
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── PROJECT FORM ─────────────────────────────────────────────────────────────

interface ProjectFormProps {
  form: FormState;
  onChange: (field: keyof FormState, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isEdit: boolean;
}

function ProjectForm({ form, onChange, onSubmit, onCancel, isEdit }: ProjectFormProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Name */}
      <div>
        <label className="caesar-label">Project Name *</label>
        <input
          className="caesar-input w-full"
          placeholder="e.g. RCA Series A Fundraise"
          value={form.name}
          onChange={(e) => onChange('name', e.target.value)}
        />
      </div>

      {/* Status + Health */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="caesar-label">Status</label>
          <select
            className="caesar-input w-full"
            value={form.status}
            onChange={(e) => onChange('status', e.target.value)}
          >
            <option value="active">Active</option>
            <option value="on-hold">On Hold</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="caesar-label">Health</label>
          <select
            className="caesar-input w-full"
            value={form.health}
            onChange={(e) => onChange('health', e.target.value)}
          >
            <option value="green">Green</option>
            <option value="yellow">Yellow</option>
            <option value="red">Red</option>
          </select>
        </div>
      </div>

      {/* Next Action */}
      <div>
        <label className="caesar-label">Next Action</label>
        <input
          className="caesar-input w-full"
          placeholder="What's the very next step?"
          value={form.nextAction}
          onChange={(e) => onChange('nextAction', e.target.value)}
        />
      </div>

      {/* Due Date */}
      <div>
        <label className="caesar-label">Due Date</label>
        <input
          type="date"
          className="caesar-input w-full"
          value={form.dueDate}
          onChange={(e) => onChange('dueDate', e.target.value)}
        />
      </div>

      {/* Key Contacts */}
      <div>
        <label className="caesar-label">Key Contacts (comma-separated)</label>
        <input
          className="caesar-input w-full"
          placeholder="e.g. Dr. Smith, John Doe, Sarah Lee"
          value={form.keyContacts}
          onChange={(e) => onChange('keyContacts', e.target.value)}
        />
      </div>

      {/* Notes */}
      <div>
        <label className="caesar-label">Notes</label>
        <textarea
          className="caesar-input w-full resize-none"
          rows={3}
          placeholder="Background, context, blockers..."
          value={form.notes}
          onChange={(e) => onChange('notes', e.target.value)}
        />
      </div>

      {/* Links */}
      <div>
        <label className="caesar-label">Links / Resources</label>
        <input
          className="caesar-input w-full"
          placeholder="https://..."
          value={form.links}
          onChange={(e) => onChange('links', e.target.value)}
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-1">
        <button onClick={onCancel} className="caesar-btn-ghost flex-1">
          Cancel
        </button>
        <button
          onClick={onSubmit}
          className="caesar-btn-primary flex-1"
          disabled={!form.name.trim()}
        >
          {isEdit ? 'Update Project' : 'Add Project'}
        </button>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function ProjectsTracker({ projects, setProjects }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [filterStatus, setFilterStatus] = useState<'all' | ProjectStatus>('all');

  const handleFieldChange = useCallback((field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const openNewModal = () => {
    setForm(defaultForm);
    setEditingId(null);
    setModalOpen(true);
  };

  const openEditModal = (project: Project) => {
    setForm(projectToForm(project));
    setEditingId(project.id);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(defaultForm);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;

    const contacts = form.keyContacts
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (editingId) {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === editingId
            ? {
                ...p,
                name: form.name.trim(),
                status: form.status,
                health: form.health,
                nextAction: form.nextAction.trim(),
                dueDate: form.dueDate,
                keyContacts: contacts,
                notes: form.notes.trim(),
                links: form.links.trim(),
              }
            : p
        )
      );
    } else {
      const newProject: Project = {
        id: generateId(),
        name: form.name.trim(),
        status: form.status,
        health: form.health,
        nextAction: form.nextAction.trim(),
        dueDate: form.dueDate,
        keyContacts: contacts,
        notes: form.notes.trim(),
        links: form.links.trim(),
        createdAt: todayStr(),
      };
      setProjects((prev) => [newProject, ...prev]);
    }

    closeModal();
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this project?')) {
      setProjects((prev) => prev.filter((p) => p.id !== id));
    }
  };

  // Filter
  const filtered =
    filterStatus === 'all' ? projects : projects.filter((p) => p.status === filterStatus);

  // Counts
  const activeCount = projects.filter((p) => p.status === 'active').length;
  const overdueCount = projects.filter((p) => p.dueDate && isOverdue(p.dueDate) && p.status !== 'completed').length;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Briefcase size={20} className="text-gold" />
          <div>
            <h1 className="section-title">Projects</h1>
            <p className="text-xs mt-0.5 transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
              {projects.length} total · {activeCount} active
              {overdueCount > 0 && (
                <span className="ml-2 text-red-400 font-medium">{overdueCount} overdue</span>
              )}
            </p>
          </div>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-arc-blue/20 text-arc-blue border border-arc-blue/30">
            {projects.length} Projects
          </span>
        </div>
        <button onClick={openNewModal} className="caesar-btn-primary flex items-center gap-2">
          <Plus size={15} />
          New Project
        </button>
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex items-center gap-2">
        {(['all', 'active', 'on-hold', 'completed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-all border duration-300"
            style={
              filterStatus === s
                ? {
                    backgroundColor: 'rgba(0,207,255,0.2)',
                    color: '#00CFFF',
                    borderColor: 'rgba(0,207,255,0.4)',
                  }
                : {
                    color: 'var(--text-muted)',
                    borderColor: 'var(--border)',
                  }
            }
            onMouseEnter={(e) => {
              if (filterStatus !== s) {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-hover)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
              }
            }}
            onMouseLeave={(e) => {
              if (filterStatus !== s) {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
              }
            }}
          >
            {s === 'all' ? 'All' : s === 'on-hold' ? 'On Hold' : s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== 'all' && (
              <span className="ml-1.5 opacity-70">
                {projects.filter((p) => p.status === s).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Project Grid ── */}
      {filtered.length === 0 ? (
        <div className="caesar-card flex flex-col items-center justify-center py-16 text-center gap-3">
          <Briefcase size={32} className="transition-colors duration-300" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
            {filterStatus === 'all' ? 'No projects yet.' : `No ${filterStatus} projects.`}
          </p>
          {filterStatus === 'all' && (
            <button onClick={openNewModal} className="caesar-btn-primary flex items-center gap-2 mt-1">
              <Plus size={14} />
              Add Your First Project
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? 'Edit Project' : 'New Project'}
        size="md"
      >
        <ProjectForm
          form={form}
          onChange={handleFieldChange}
          onSubmit={handleSubmit}
          onCancel={closeModal}
          isEdit={!!editingId}
        />
      </Modal>
    </div>
  );
}
