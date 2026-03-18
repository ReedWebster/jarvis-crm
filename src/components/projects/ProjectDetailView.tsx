import React, { useState } from 'react';
import {
  ArrowLeft,
  Github,
  ExternalLink,
  Users,
  FileText,
  Plus,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Calendar,
  Loader2,
  CheckSquare,
  BookOpen,
} from 'lucide-react';
import type { Project, Contact, MeetingNote, MeetingAISummary } from '../../types';
import { AddMeetingNoteModal } from './AddMeetingNoteModal';

interface Props {
  project: Project;
  contacts: Contact[];
  onBack: () => void;
  onUpdate: (updated: Project) => void;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  'on-hold': 'On Hold',
  completed: 'Completed',
};

const STATUS_COLORS: Record<string, string> = {
  active: '#4ade80',
  'on-hold': '#facc15',
  completed: '#60a5fa',
};

const HEALTH_COLORS: Record<string, string> = {
  green: '#4ade80',
  yellow: '#facc15',
  red: '#f87171',
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function MeetingCard({
  meeting,
  onSummarize,
  summarizingId,
}: {
  meeting: MeetingNote;
  onSummarize: (id: string) => void;
  summarizingId: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const isSummarizing = summarizingId === meeting.id;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}
    >
      {/* Meeting header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Calendar size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <div className="min-w-0">
            <span
              className="text-sm font-medium truncate block"
              style={{ color: 'var(--text-primary)' }}
            >
              {meeting.title}
            </span>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {formatDate(meeting.date)}
              </span>
              {meeting.attendees.length > 0 && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  · {meeting.attendees.join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-2 shrink-0">
          {meeting.aiSummary ? (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}
            >
              AI Summary
            </span>
          ) : (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            >
              Raw Notes
            </span>
          )}
          {expanded ? (
            <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
          ) : (
            <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {meeting.aiSummary ? (
            <div className="flex flex-col gap-0">
              {/* Summary section */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <BookOpen size={12} style={{ color: 'var(--text-muted)' }} />
                  <span
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Summary
                  </span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {meeting.aiSummary.summary}
                </p>
              </div>

              {/* Key Points */}
              {meeting.aiSummary.keyPoints.length > 0 && (
                <div
                  className="px-4 py-3"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Key Points
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {meeting.aiSummary.keyPoints.map((pt, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <span
                          className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: '#4ade80' }}
                        />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Items */}
              {meeting.aiSummary.actionItems.length > 0 && (
                <div
                  className="px-4 py-3"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-1.5 mb-3">
                    <CheckSquare size={12} style={{ color: 'var(--text-muted)' }} />
                    <span
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Action Items
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {meeting.aiSummary.actionItems.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg px-3 py-2.5"
                        style={{ backgroundColor: 'var(--bg-hover)' }}
                      >
                        <div
                          className="text-xs font-medium px-2 py-0.5 rounded shrink-0 mt-0.5"
                          style={{
                            backgroundColor: 'rgba(96,165,250,0.15)',
                            color: '#60a5fa',
                            border: '1px solid rgba(96,165,250,0.25)',
                          }}
                        >
                          {item.assignee}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                            {item.action}
                          </p>
                          {item.dueDate && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              Due: {formatDate(item.dueDate)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw notes (collapsed) */}
              <div
                className="px-4 py-2"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <details>
                  <summary
                    className="text-xs cursor-pointer select-none"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    View raw notes
                  </summary>
                  <pre
                    className="mt-2 text-xs whitespace-pre-wrap rounded p-3"
                    style={{
                      color: 'var(--text-secondary)',
                      backgroundColor: 'var(--bg-hover)',
                      fontFamily: 'inherit',
                      lineHeight: 1.6,
                    }}
                  >
                    {meeting.rawNotes}
                  </pre>
                </details>
              </div>
            </div>
          ) : (
            /* No AI summary yet */
            <div className="flex flex-col gap-0">
              <div className="px-4 py-3">
                <pre
                  className="text-sm whitespace-pre-wrap leading-relaxed"
                  style={{
                    color: 'var(--text-primary)',
                    fontFamily: 'inherit',
                  }}
                >
                  {meeting.rawNotes}
                </pre>
              </div>
              <div
                className="px-4 py-3 flex items-center gap-3"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <button
                  onClick={() => onSummarize(meeting.id)}
                  disabled={isSummarizing}
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded transition-colors duration-200 disabled:opacity-50"
                  style={{
                    backgroundColor: 'rgba(74,222,128,0.1)',
                    color: '#4ade80',
                    border: '1px solid rgba(74,222,128,0.3)',
                  }}
                >
                  {isSummarizing ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  {isSummarizing ? 'Summarizing with AI…' : 'Summarize with AI'}
                </button>
                {isSummarizing && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Extracting key points and action items…
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ProjectDetailView({ project, contacts, onBack, onUpdate }: Props) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);

  const keyContacts = (project.keyContacts ?? [])
    .map(id => contacts.find(c => c.id === id))
    .filter((c): c is Contact => !!c);

  const meetings = [...(project.meetingNotes ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  async function handleSummarize(meetingId: string) {
    const meeting = (project.meetingNotes ?? []).find(m => m.id === meetingId);
    if (!meeting) return;

    setSummarizingId(meetingId);
    try {
      const res = await fetch('/api/summarize-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: meeting.title,
          date: meeting.date,
          attendees: meeting.attendees,
          rawNotes: meeting.rawNotes,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const aiSummary: MeetingAISummary = {
        summary: data.summary,
        keyPoints: data.keyPoints,
        actionItems: data.actionItems,
        summarizedAt: new Date().toISOString(),
      };

      const updatedMeetings = (project.meetingNotes ?? []).map(m =>
        m.id === meetingId ? { ...m, aiSummary } : m
      );
      onUpdate({ ...project, meetingNotes: updatedMeetings });
    } catch (err) {
      console.error('[ProjectDetailView] Summarize error:', err);
    } finally {
      setSummarizingId(null);
    }
  }

  function handleAddMeeting(note: MeetingNote) {
    const updated = [...(project.meetingNotes ?? []), note];
    onUpdate({ ...project, meetingNotes: updated });
  }

  const links = project.links ? project.links.split(/[\s,]+/).filter(Boolean) : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded transition-colors duration-200 shrink-0 mt-0.5"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <ArrowLeft size={13} />
          <span>Projects</span>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="section-title" style={{ marginBottom: 0 }}>
              {project.name}
            </h1>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                color: STATUS_COLORS[project.status],
                backgroundColor: `${STATUS_COLORS[project.status]}18`,
                border: `1px solid ${STATUS_COLORS[project.status]}40`,
              }}
            >
              {STATUS_LABELS[project.status]}
            </span>
            <span
              className="inline-block w-2 h-2 rounded-full"
              title={`Health: ${project.health}`}
              style={{ backgroundColor: HEALTH_COLORS[project.health] ?? '#6b7280' }}
            />
          </div>
        </div>
      </div>

      {/* Key info grid */}
      <div
        className="grid grid-cols-2 gap-3 p-4 rounded-lg"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {project.nextAction && (
          <div className="col-span-2">
            <p
              className="text-xs font-semibold uppercase tracking-wide mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Next Action
            </p>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {project.nextAction}
            </p>
          </div>
        )}

        {project.dueDate && (
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wide mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Due Date
            </p>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {formatDate(project.dueDate)}
            </p>
          </div>
        )}

        {project.githubRepo && (
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wide mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              GitHub
            </p>
            <a
              href={`https://github.com/${project.githubRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm transition-colors duration-200"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            >
              <Github size={13} />
              <span>{project.githubRepo}</span>
            </a>
          </div>
        )}

        {links.length > 0 && (
          <div className="col-span-2">
            <p
              className="text-xs font-semibold uppercase tracking-wide mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Links
            </p>
            <div className="flex flex-wrap gap-2">
              {links.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs transition-colors duration-200"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                >
                  <ExternalLink size={11} />
                  <span className="truncate max-w-[200px]">
                    {url.replace(/^https?:\/\//, '')}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      {project.notes && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText size={13} style={{ color: 'var(--text-muted)' }} />
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}
            >
              Notes
            </p>
          </div>
          <div
            className="p-4 rounded-lg text-sm leading-relaxed"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {project.notes}
          </div>
        </div>
      )}

      {/* Key Contacts */}
      {keyContacts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Users size={13} style={{ color: 'var(--text-muted)' }} />
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}
            >
              Key Contacts
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {keyContacts.map(contact => (
              <div
                key={contact.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <span style={{ color: 'var(--text-primary)' }}>{contact.name}</span>
                {contact.company && (
                  <span style={{ color: 'var(--text-muted)' }}>· {contact.company}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meeting Notes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}
            >
              Meeting Notes
            </p>
            {meetings.length > 0 && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
              >
                {meetings.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors duration-200"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <Plus size={12} />
            <span>Add Meeting</span>
          </button>
        </div>

        {meetings.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-10 rounded-lg text-center"
            style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}
          >
            <Calendar size={22} className="mb-2 opacity-30" />
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              No meeting notes yet
            </p>
            <p className="text-xs mt-1">
              Click "Add Meeting" to record your first one. You can type or speak — AI will extract
              key points and action items.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {meetings.map(meeting => (
              <MeetingCard
                key={meeting.id}
                meeting={meeting}
                onSummarize={handleSummarize}
                summarizingId={summarizingId}
              />
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddMeetingNoteModal
          project={project}
          onClose={() => setShowAddModal(false)}
          onSave={handleAddMeeting}
        />
      )}
    </div>
  );
}
