import React, { useState, useRef, KeyboardEvent, useEffect } from 'react';
import { X, Sparkles, Save, Loader2, Mic, MicOff, Circle } from 'lucide-react';
import type { Project, MeetingNote, MeetingAISummary } from '../../types';

interface Props {
  project: Project;
  onClose: () => void;
  onSave: (note: MeetingNote) => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Check for Web Speech API support
const hasSpeechAPI =
  typeof window !== 'undefined' &&
  (('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window));

export function AddMeetingNoteModal({ project, onClose, onSave }: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayISO());
  const [attendeeInput, setAttendeeInput] = useState('');
  const [attendees, setAttendees] = useState<string[]>([]);
  const [rawNotes, setRawNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const attendeeRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function addAttendee(value: string) {
    const trimmed = value.trim().replace(/,+$/, '').trim();
    if (trimmed && !attendees.includes(trimmed)) {
      setAttendees(prev => [...prev, trimmed]);
    }
    setAttendeeInput('');
  }

  function handleAttendeeKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addAttendee(attendeeInput);
    } else if (e.key === 'Backspace' && attendeeInput === '' && attendees.length > 0) {
      setAttendees(prev => prev.slice(0, -1));
    }
  }

  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          if (text) {
            setRawNotes(prev => (prev ? prev + ' ' + text : text));
          }
        }
      }
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }

  function buildNote(): MeetingNote {
    return {
      id: `meeting_${Date.now()}`,
      title: title.trim() || 'Untitled Meeting',
      date,
      attendees,
      rawNotes,
      createdAt: new Date().toISOString(),
    };
  }

  async function handleSaveOnly() {
    setSaving(true);
    const note = buildNote();
    onSave(note);
    setSaving(false);
    onClose();
  }

  async function handleSaveAndSummarize() {
    setSummarizing(true);
    const note = buildNote();
    try {
      const res = await fetch('/api/summarize-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: note.title,
          date: note.date,
          attendees: note.attendees,
          rawNotes: note.rawNotes,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const aiSummary: MeetingAISummary = {
          summary: data.summary,
          keyPoints: data.keyPoints,
          actionItems: data.actionItems,
          summarizedAt: new Date().toISOString(),
        };
        onSave({ ...note, aiSummary });
      } else {
        onSave(note);
      }
    } catch {
      onSave(note);
    } finally {
      setSummarizing(false);
      onClose();
    }
  }

  const canSave = rawNotes.trim().length > 0;
  const isLoading = saving || summarizing;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget && !isLoading) onClose(); }}
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
            Add Meeting Notes — {project.name}
          </h2>
          {!isLoading && (
            <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Form */}
        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto">
          {/* Title */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              Meeting Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Kickoff Call, Weekly Sync, Client Review"
              disabled={isLoading}
              className="w-full rounded px-3 py-2 text-sm outline-none disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Date */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              disabled={isLoading}
              className="rounded px-3 py-2 text-sm outline-none disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                colorScheme: 'dark',
              }}
            />
          </div>

          {/* Attendees */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              Attendees{' '}
              <span style={{ fontWeight: 400 }}>(press Enter or comma to add)</span>
            </label>
            <div
              className="flex flex-wrap gap-1.5 px-3 py-2 rounded min-h-[38px] cursor-text"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
              }}
              onClick={() => attendeeRef.current?.focus()}
            >
              {attendees.map(name => (
                <span
                  key={name}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}
                >
                  {name}
                  {!isLoading && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setAttendees(prev => prev.filter(a => a !== name));
                      }}
                    >
                      <X size={10} />
                    </button>
                  )}
                </span>
              ))}
              <input
                ref={attendeeRef}
                type="text"
                value={attendeeInput}
                onChange={e => setAttendeeInput(e.target.value)}
                onKeyDown={handleAttendeeKeyDown}
                onBlur={() => { if (attendeeInput.trim()) addAttendee(attendeeInput); }}
                disabled={isLoading}
                placeholder={attendees.length === 0 ? 'Type a name…' : ''}
                className="flex-1 min-w-[100px] bg-transparent text-sm outline-none disabled:opacity-50"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* Notes + Voice Recording */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Notes{' '}
                <span style={{ fontWeight: 400 }}>(required)</span>
              </label>
              {hasSpeechAPI && (
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-colors duration-200 disabled:opacity-40"
                  style={
                    isRecording
                      ? {
                          backgroundColor: 'rgba(239,68,68,0.15)',
                          border: '1px solid rgba(239,68,68,0.4)',
                          color: '#f87171',
                        }
                      : {
                          backgroundColor: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-muted)',
                        }
                  }
                  onMouseEnter={e => {
                    if (!isRecording && !isLoading)
                      e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={e => {
                    if (!isRecording) e.currentTarget.style.color = 'var(--text-muted)';
                  }}
                  title={isRecording ? 'Stop recording' : 'Record & transcribe audio'}
                >
                  {isRecording ? (
                    <>
                      <Circle size={8} className="animate-pulse" style={{ fill: '#f87171' }} />
                      <MicOff size={12} />
                      <span>Stop</span>
                    </>
                  ) : (
                    <>
                      <Mic size={12} />
                      <span>Record</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {isRecording && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded mb-2 text-xs"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#f87171',
                }}
              >
                <Circle size={6} className="animate-pulse" style={{ fill: '#f87171' }} />
                Listening… speak clearly. Transcription will appear in notes below.
              </div>
            )}

            <textarea
              ref={notesRef}
              value={rawNotes}
              onChange={e => setRawNotes(e.target.value)}
              placeholder={
                isRecording
                  ? 'Transcription will appear here as you speak…'
                  : 'Paste or type your meeting notes here, or use the Record button to transcribe audio.'
              }
              disabled={isLoading}
              rows={8}
              className="w-full rounded px-3 py-2 text-sm outline-none resize-y disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: isRecording
                  ? '1px solid rgba(239,68,68,0.4)'
                  : '1px solid var(--border)',
                color: 'var(--text-primary)',
                minHeight: 160,
                transition: 'border-color 0.2s',
              }}
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
            disabled={isLoading}
            className="text-xs px-3 py-2 rounded transition-colors duration-200 disabled:opacity-50"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            Cancel
          </button>

          <button
            onClick={handleSaveOnly}
            disabled={!canSave || isLoading}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded transition-colors duration-200 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={e => {
              if (canSave && !isLoading) e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save Notes
          </button>

          <button
            onClick={handleSaveAndSummarize}
            disabled={!canSave || isLoading}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded transition-colors duration-200 disabled:opacity-50"
            style={{
              backgroundColor: 'rgba(74,222,128,0.1)',
              border: '1px solid rgba(74,222,128,0.3)',
              color: '#4ade80',
            }}
          >
            {summarizing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {summarizing ? 'Summarizing…' : 'Save & Summarize'}
          </button>
        </div>
      </div>
    </div>
  );
}
