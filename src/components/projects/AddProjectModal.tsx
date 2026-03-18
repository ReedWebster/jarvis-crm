import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Project, ProjectStatus, HealthColor } from '../../types';

interface Props {
  onClose: () => void;
  onSave: (project: Project) => void;
}

const INPUT_STYLE = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
} as const;

export function AddProjectModal({ onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [health, setHealth] = useState<HealthColor>('green');
  const [nextAction, setNextAction] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [links, setLinks] = useState('');
  const [notes, setNotes] = useState('');

  const canSave = name.trim().length > 0;

  function handleSave() {
    const project: Project = {
      id: `proj_${Date.now()}`,
      name: name.trim(),
      status,
      health,
      nextAction,
      dueDate,
      keyContacts: [],
      notes,
      links,
      githubRepo: githubRepo.trim() || undefined,
      createdAt: new Date().toISOString(),
      meetingNotes: [],
    };
    onSave(project);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-xl flex flex-col"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            New Project
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto">
          {/* Name */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              Project Name <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canSave) handleSave(); }}
              placeholder="e.g. Vanta Marketing, Rock Canyon AI"
              autoFocus
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={INPUT_STYLE}
            />
          </div>

          {/* Status + Health */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
                Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as ProjectStatus)}
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{ ...INPUT_STYLE, colorScheme: 'dark' }}
              >
                <option value="active">Active</option>
                <option value="on-hold">On Hold</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
                Health
              </label>
              <select
                value={health}
                onChange={e => setHealth(e.target.value as HealthColor)}
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{ ...INPUT_STYLE, colorScheme: 'dark' }}
              >
                <option value="green">Green</option>
                <option value="yellow">Yellow</option>
                <option value="red">Red</option>
              </select>
            </div>
          </div>

          {/* Next Action */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              Next Action
            </label>
            <input
              type="text"
              value={nextAction}
              onChange={e => setNextAction(e.target.value)}
              placeholder="What's the immediate next step?"
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={INPUT_STYLE}
            />
          </div>

          {/* Due Date */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="rounded px-3 py-2 text-sm outline-none"
              style={{ ...INPUT_STYLE, colorScheme: 'dark' }}
            />
          </div>

          {/* GitHub Repo */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              GitHub Repo{' '}
              <span style={{ fontWeight: 400 }}>(owner/repo)</span>
            </label>
            <input
              type="text"
              value={githubRepo}
              onChange={e => setGithubRepo(e.target.value)}
              placeholder="e.g. reedwebster/litehouse"
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={INPUT_STYLE}
            />
          </div>

          {/* Links */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              Links{' '}
              <span style={{ fontWeight: 400 }}>(space-separated URLs)</span>
            </label>
            <input
              type="text"
              value={links}
              onChange={e => setLinks(e.target.value)}
              placeholder="https://example.com https://docs.example.com"
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={INPUT_STYLE}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Background, goals, or context for this project..."
              rows={4}
              className="w-full rounded px-3 py-2 text-sm outline-none resize-y"
              style={INPUT_STYLE}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-4"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="text-xs px-3 py-2 rounded transition-colors duration-200"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="text-xs px-4 py-2 rounded transition-colors duration-200 disabled:opacity-50"
            style={{
              backgroundColor: 'rgba(74,222,128,0.1)',
              border: '1px solid rgba(74,222,128,0.3)',
              color: '#4ade80',
            }}
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
}
