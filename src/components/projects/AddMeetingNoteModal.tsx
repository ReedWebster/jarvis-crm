import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { X, Sparkles, Save, Loader2, Mic, MicOff, Square, Circle } from 'lucide-react';
import type { Project, MeetingNote, MeetingAISummary } from '../../types';

interface Props {
  project: Project;
  onClose: () => void;
  onSave: (note: MeetingNote) => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1]); // strip "data:audio/webm;base64," prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const hasSpeechAPI =
  typeof window !== 'undefined' &&
  (('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window));

type RecordingState = 'idle' | 'recording-groq' | 'transcribing' | 'recording-speech' | 'error';

export function AddMeetingNoteModal({ project, onClose, onSave }: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayISO());
  const [attendeeInput, setAttendeeInput] = useState('');
  const [attendees, setAttendees] = useState<string[]>([]);
  const [rawNotes, setRawNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  // Recording state
  const [recordState, setRecordState] = useState<RecordingState>('idle');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  // Once we know Groq is unavailable (503/429), skip straight to Web Speech next time
  const groqUnavailableRef = useRef(false);

  const attendeeRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current!);
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
      speechRef.current?.stop();
    };
  }, []);

  // ── Attendees ────────────────────────────────────────────────────────────────

  function addAttendee(value: string) {
    const trimmed = value.trim().replace(/,+$/, '').trim();
    if (trimmed && !attendees.includes(trimmed)) setAttendees(prev => [...prev, trimmed]);
    setAttendeeInput('');
  }

  function handleAttendeeKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addAttendee(attendeeInput); }
    else if (e.key === 'Backspace' && attendeeInput === '' && attendees.length > 0) {
      setAttendees(prev => prev.slice(0, -1));
    }
  }

  // ── Timer ────────────────────────────────────────────────────────────────────

  function startTimer() {
    setRecordSeconds(0);
    timerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
  }

  function stopTimer() {
    clearInterval(timerRef.current!);
    timerRef.current = null;
  }

  // ── Groq recording (MediaRecorder → /api/transcribe) ─────────────────────────

  async function startGroqRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        stopTimer();
        await transcribeWithGroq(mimeType);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250); // 250ms chunks
      setRecordState('recording-groq');
      setStatusMsg(null);
      startTimer();
    } catch {
      // Mic permission denied — fall back to Web Speech if available
      if (hasSpeechAPI) startWebSpeech();
      else setStatusMsg('Microphone access denied.');
    }
  }

  function stopGroqRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }

  async function transcribeWithGroq(mimeType: string) {
    setRecordState('transcribing');
    setStatusMsg('Transcribing with Groq Whisper…');

    try {
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      const base64 = await blobToBase64(blob);

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64, mimeType }),
      });

      if (res.status === 503 || res.status === 429) {
        // Groq not configured or rate-limited → switch to Web Speech
        groqUnavailableRef.current = true;
        setStatusMsg(
          res.status === 429
            ? 'Groq rate limit reached — switching to live transcription. Speak now.'
            : 'Groq not configured — switching to live transcription. Speak now.'
        );
        setRecordState('idle');
        startWebSpeech();
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.text) {
        setRawNotes(prev => (prev ? prev + '\n' + data.text : data.text));
        setStatusMsg('Transcription complete.');
      } else {
        setStatusMsg('No speech detected.');
      }
    } catch {
      setStatusMsg('Transcription failed — check console. Try again or type notes manually.');
    } finally {
      setRecordState('idle');
    }
  }

  // ── Web Speech API (live, streaming) ─────────────────────────────────────────

  function startWebSpeech() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          if (text) setRawNotes(prev => (prev ? prev + ' ' + text : text));
        }
      }
    };

    recognition.onerror = () => {
      setRecordState('idle');
      stopTimer();
      setStatusMsg('Live transcription stopped.');
    };

    recognition.onend = () => {
      setRecordState('idle');
      stopTimer();
    };

    speechRef.current = recognition;
    recognition.start();
    setRecordState('recording-speech');
    setStatusMsg('Live transcription active. Speak now.');
    startTimer();
  }

  function stopWebSpeech() {
    speechRef.current?.stop();
    speechRef.current = null;
    stopTimer();
    setRecordState('idle');
  }

  // ── Main toggle ───────────────────────────────────────────────────────────────

  function handleRecordToggle() {
    if (recordState === 'recording-groq') {
      stopGroqRecording();
      return;
    }
    if (recordState === 'recording-speech') {
      stopWebSpeech();
      return;
    }
    // Start: prefer Groq unless we know it's unavailable
    if (groqUnavailableRef.current || !hasSpeechAPI) {
      // Groq known unavailable and no Web Speech → nothing to do (shouldn't happen)
      // Groq known unavailable → use Web Speech
      if (groqUnavailableRef.current && hasSpeechAPI) { startWebSpeech(); return; }
    }
    // Default: try Groq first
    startGroqRecording();
  }

  const isRecording = recordState === 'recording-groq' || recordState === 'recording-speech';
  const isTranscribing = recordState === 'transcribing';

  // ── Save / Summarize ──────────────────────────────────────────────────────────

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
    onSave(buildNote());
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

  // ── Recording button label ────────────────────────────────────────────────────

  function recordButtonLabel() {
    if (recordState === 'recording-groq') return `Stop  ${formatSeconds(recordSeconds)}`;
    if (recordState === 'recording-speech') return `Stop  ${formatSeconds(recordSeconds)}`;
    if (recordState === 'transcribing') return 'Transcribing…';
    if (groqUnavailableRef.current) return 'Record (live)';
    return 'Record';
  }

  const showRecordButton = hasSpeechAPI || true; // always show (Groq works even without Web Speech)

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
              <span style={{ fontWeight: 400 }}>(Enter or comma to add)</span>
            </label>
            <div
              className="flex flex-wrap gap-1.5 px-3 py-2 rounded min-h-[38px] cursor-text"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
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
                    <button onClick={e => { e.stopPropagation(); setAttendees(prev => prev.filter(a => a !== name)); }}>
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

          {/* Notes + Record button */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Notes <span style={{ fontWeight: 400 }}>(required)</span>
              </label>

              <button
                type="button"
                onClick={handleRecordToggle}
                disabled={isLoading || isTranscribing}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-colors duration-200 disabled:opacity-40"
                style={
                  isRecording
                    ? {
                        backgroundColor: 'rgba(239,68,68,0.15)',
                        border: '1px solid rgba(239,68,68,0.4)',
                        color: '#f87171',
                      }
                    : isTranscribing
                    ? {
                        backgroundColor: 'rgba(250,204,21,0.1)',
                        border: '1px solid rgba(250,204,21,0.3)',
                        color: '#facc15',
                      }
                    : {
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-muted)',
                      }
                }
                onMouseEnter={e => {
                  if (!isRecording && !isTranscribing && !isLoading)
                    e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={e => {
                  if (!isRecording && !isTranscribing)
                    e.currentTarget.style.color = 'var(--text-muted)';
                }}
                title={
                  groqUnavailableRef.current
                    ? 'Live transcription (Web Speech API)'
                    : 'Record audio — transcribed by Groq Whisper, falls back to live transcription'
                }
              >
                {isTranscribing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : isRecording ? (
                  <>
                    <Circle size={7} className="animate-pulse" style={{ fill: '#f87171' }} />
                    <Square size={11} />
                  </>
                ) : (
                  <Mic size={12} />
                )}
                <span>{recordButtonLabel()}</span>
              </button>
            </div>

            {/* Status message */}
            {statusMsg && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded mb-2 text-xs"
                style={{
                  backgroundColor: isRecording
                    ? 'rgba(239,68,68,0.08)'
                    : 'rgba(250,204,21,0.06)',
                  border: isRecording
                    ? '1px solid rgba(239,68,68,0.25)'
                    : '1px solid rgba(250,204,21,0.2)',
                  color: isRecording ? '#f87171' : '#facc15',
                }}
              >
                {isRecording && (
                  <Circle size={6} className="animate-pulse shrink-0" style={{ fill: '#f87171' }} />
                )}
                {statusMsg}
              </div>
            )}

            <textarea
              value={rawNotes}
              onChange={e => setRawNotes(e.target.value)}
              placeholder={
                isRecording
                  ? recordState === 'recording-speech'
                    ? 'Transcription appears here as you speak…'
                    : 'Recording audio — click Stop when done, Whisper will transcribe it.'
                  : 'Paste or type your meeting notes, or click Record to transcribe audio.'
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

            {/* Groq vs fallback hint */}
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {groqUnavailableRef.current
                ? 'Using live transcription (Web Speech API). Add GROQ_API_KEY for higher accuracy.'
                : 'Audio transcribed by Groq Whisper. Falls back to live transcription if unavailable.'}
            </p>
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
