import React, { useState, useRef, useEffect } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { X, Mic, MicOff, Play, Pause, Trash2, Camera, MessageSquare, Edit3, CheckCircle, AlertTriangle, Mail, Inbox } from 'lucide-react';
import type { Contact, ContactMapData, RelationshipStrength, NetworkOrg, CityBuilding } from '../../types';
import { generateId, todayStr } from '../../utils';
import {
  getContactStrengthColor,
  strengthLabel,
  getContactInitials,
  compressImage,
  getLastContactedColor,
} from '../../utils/networkingMap';
import { useGmail } from '../../hooks/useGmail';
import { EmailComposeModal } from '../email/EmailComposeModal';
import { EmailThread } from '../email/EmailThread';

const STRENGTH_OPTIONS: RelationshipStrength[] = ['hot', 'warm', 'cold', 'personal'];
const INTERACTION_TYPES = ['Call', 'Email', 'Meeting', 'Text', 'LinkedIn'];

interface Props {
  contact: Contact;
  mapData: ContactMapData;
  onClose: () => void;
  onUpdateMapData: (data: Partial<ContactMapData>) => void;
  onUpdateContact: (updated: Contact) => void;
  onEditInCRM: () => void;
  orgs?: NetworkOrg[];
  onUpdateOrgs?: (orgs: NetworkOrg[]) => void;
  buildings?: CityBuilding[];
}

// ─── VOICE NOTE RECORDER ─────────────────────────────────────────────────────

function VoiceNoteSection({
  voiceNote,
  onSave,
  onDelete,
}: {
  voiceNote?: string;
  onSave: (b64: string) => void;
  onDelete: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => onSave(reader.result as string);
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      // Auto-stop at 60s
      timerRef.current = setTimeout(() => stopRecording(), 60000);
    } catch {
      alert('Microphone access denied.');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    mediaRef.current?.stop();
    setRecording(false);
  };

  const togglePlay = () => {
    if (!voiceNote) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(voiceNote);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <div>
      <div className="caesar-label mb-2">Voice Note</div>
      <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
        <AlertTriangle size={10} className="inline mr-1" />
        Voice notes are stored as base64 in localStorage. Keep recordings brief.
      </div>
      <div className="flex items-center gap-2">
        {!voiceNote && !recording && (
          <button
            onClick={startRecording}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-card)' }}
          >
            <Mic size={12} /> Record (max 60s)
          </button>
        )}
        {recording && (
          <button
            onClick={stopRecording}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs pulse-glow"
            style={{ borderColor: '#dc2626', color: '#dc2626', backgroundColor: 'var(--bg-card)' }}
          >
            <MicOff size={12} /> Stop Recording
          </button>
        )}
        {voiceNote && (
          <>
            <button
              onClick={togglePlay}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-card)' }}
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={() => { audioRef.current?.pause(); setPlaying(false); audioRef.current = null; onDelete(); }}
              className="p-1.5 rounded border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)' }}
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── MAIN POPUP ──────────────────────────────────────────────────────────────

export function ContactMapPopup({ contact, mapData, onClose, onUpdateMapData, onUpdateContact, onEditInCRM, orgs = [], onUpdateOrgs, buildings = [] }: Props) {
  const [tab, setTab] = useState<'info' | 'log'>('info');
  const [showCompose, setShowCompose] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const { isConnected: gmailConnected } = useGmail();
  const [logType, setLogType] = useState('Call');
  const [logNotes, setLogNotes] = useState('');
  const [logDate, setLogDate] = useState(todayStr());
  const [reminderDate, setReminderDate] = useState(contact.followUpDate ?? '');
  const [mapNotes, setMapNotes] = useState(mapData.mapNotes);
  const [strength, setStrength] = useState<RelationshipStrength>(mapData.strength);
  const [metAt, setMetAt] = useState((contact as any).metAt ?? '');

  const strengthColor = getContactStrengthColor(strength);
  const daysSince = contact.lastContacted
    ? differenceInDays(new Date(), parseISO(contact.lastContacted))
    : null;
  const lastContactedColor = contact.lastContacted ? getLastContactedColor(contact.lastContacted) : '#6b7280';

  // Save map notes immediately on every change — no blur required
  const handleMapNotesChange = (value: string) => {
    setMapNotes(value);
    onUpdateMapData({ mapNotes: value });
  };

  const handleMetAtChange = (value: string) => {
    setMetAt(value);
    onUpdateContact({ ...contact, metAt: value } as any);
  };

  const toggleOrg = (org: NetworkOrg) => {
    if (!onUpdateOrgs) return;
    const isMember = org.memberContactIds.includes(contact.id);
    const updatedOrg: NetworkOrg = {
      ...org,
      memberContactIds: isMember
        ? org.memberContactIds.filter(id => id !== contact.id)
        : [...org.memberContactIds, contact.id],
    };
    const updatedOrgs = orgs.map(o => o.id === org.id ? updatedOrg : o);
    onUpdateOrgs(updatedOrgs);
    // Auto-tag when joining an org with autoTag
    if (!isMember && org.autoTag && !contact.tags.includes(org.autoTag)) {
      onUpdateContact({ ...contact, tags: [...contact.tags, org.autoTag] });
    }
  };

  const logInteraction = () => {
    if (!logNotes.trim()) return;
    const interaction = { id: generateId(), date: logDate, type: logType, notes: logNotes };
    const updated: Contact = {
      ...contact,
      lastContacted: logDate,
      interactions: [interaction, ...contact.interactions],
    };
    onUpdateContact(updated);
    setLogNotes('');
    setTab('info');
  };

  // Save reminder immediately on date change
  const handleReminderChange = (value: string) => {
    setReminderDate(value);
    const updated: Contact = { ...contact, followUpDate: value, followUpNeeded: !!value };
    onUpdateContact(updated);
  };

  const markFollowUpDone = () => {
    const updated: Contact = { ...contact, followUpNeeded: false, followUpDate: '' };
    onUpdateContact(updated);
    setReminderDate('');
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await compressImage(file, 80);
      onUpdateMapData({ photo: b64 });
    } catch { /* ignore */ }
  };

  return (
    <div
      className="rounded-xl shadow-2xl border w-80 max-h-[520px] overflow-y-auto flex flex-col"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        {/* Avatar */}
        <div
          className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden text-sm font-bold"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: `3px solid ${strengthColor}`,
            color: 'var(--text-primary)',
          }}
        >
          {mapData.photo
            ? <img src={mapData.photo} alt={contact.name} className="w-full h-full object-cover" />
            : getContactInitials(contact.name)
          }
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {contact.name}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{contact.relationship || contact.company}</div>

          {/* Strength selector */}
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {STRENGTH_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => { setStrength(s); onUpdateMapData({ strength: s }); }}
                className="px-1.5 py-0.5 rounded text-xs border transition-all"
                style={{
                  borderColor: strength === s ? getContactStrengthColor(s) : 'var(--border)',
                  color: strength === s ? getContactStrengthColor(s) : 'var(--text-muted)',
                  backgroundColor: 'transparent',
                  fontWeight: strength === s ? 600 : 400,
                }}
              >
                {strengthLabel(s)}
              </button>
            ))}
          </div>
        </div>

        {/* Close */}
        <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
        {(['info', 'log'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 text-xs font-medium capitalize transition-colors"
            style={{
              color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: tab === t ? '2px solid var(--text-primary)' : '2px solid transparent',
            }}
          >
            {t === 'info' ? 'Info' : 'Log Interaction'}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-3">
        {tab === 'info' && (
          <>
            {/* Tags */}
            {contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {contact.tags.map(tag => (
                  <span key={tag} className="tag" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Where / How You Met */}
            <div>
              <div className="caesar-label">Where / How You Met</div>
              <input
                className="caesar-input text-xs w-full"
                list="metat-suggestions"
                placeholder="e.g. Harvard, YC S24, Conference…"
                value={metAt}
                onChange={e => handleMetAtChange(e.target.value)}
              />
            </div>

            {/* Org Bubbles */}
            {orgs.length > 0 && (
              <div>
                <div className="caesar-label">Organizations</div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {orgs.map(org => {
                    const isMember = org.memberContactIds.includes(contact.id);
                    return (
                      <button
                        key={org.id}
                        onClick={() => toggleOrg(org)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs transition-all"
                        style={{
                          borderColor: isMember ? org.color : 'var(--border)',
                          backgroundColor: isMember ? `${org.color}22` : 'transparent',
                          color: isMember ? org.color : 'var(--text-muted)',
                          fontWeight: isMember ? 600 : 400,
                        }}
                        title={isMember ? `Remove from ${org.name}` : `Add to ${org.name}`}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: org.color }} />
                        {org.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Last contacted */}
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Last contacted:</span>
              <span style={{ color: lastContactedColor, fontWeight: 600 }}>
                {daysSince === null ? 'Never' : daysSince === 0 ? 'Today' : `${daysSince}d ago`}
              </span>
            </div>

            {/* Follow-up */}
            <div>
              <div className="caesar-label">Follow-Up Reminder</div>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  className="caesar-input text-xs"
                  value={reminderDate}
                  onChange={e => handleReminderChange(e.target.value)}
                  style={{ flex: 1 }}
                />
                {contact.followUpNeeded && (
                  <button
                    onClick={markFollowUpDone}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs flex-shrink-0"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-elevated)' }}
                  >
                    <CheckCircle size={12} /> Done
                  </button>
                )}
              </div>
            </div>

            {/* City Location */}
            {buildings.length > 0 && (
              <div>
                <div className="caesar-label">City Location</div>
                <select
                  className="caesar-input text-xs"
                  value={mapData.buildingId ?? ''}
                  onChange={e => onUpdateMapData({ buildingId: e.target.value || undefined })}
                  style={{ width: '100%' }}
                >
                  <option value="">— Not assigned —</option>
                  {(['byu','vanta','rockcanyonai','neighborhood','chapel','outskirts'] as const).map(did => {
                    const dBuildings = buildings.filter(b => b.districtId === did);
                    if (!dBuildings.length) return null;
                    const dName = { byu:'BYU District', vanta:'Vanta HQ', rockcanyonai:'Rock Canyon AI', neighborhood:'Neighborhood', chapel:'Chapel District', outskirts:'Outskirts' }[did];
                    return (
                      <optgroup key={did} label={dName}>
                        {dBuildings.map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.contactIds.length})</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Map notes */}
            <div>
              <div className="caesar-label">Map Notes</div>
              <textarea
                className="caesar-textarea text-xs"
                rows={3}
                placeholder="Notes specific to map context..."
                value={mapNotes}
                onChange={e => handleMapNotesChange(e.target.value)}
              />
            </div>

            {/* Photo */}
            <div>
              <div className="caesar-label">Photo</div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-card)' }}>
                  <Camera size={12} /> {mapData.photo ? 'Change Photo' : 'Upload Photo'}
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                </label>
                {mapData.photo && (
                  <button
                    onClick={() => onUpdateMapData({ photo: undefined })}
                    className="p-1.5 rounded border"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)' }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Voice note */}
            <VoiceNoteSection
              voiceNote={mapData.voiceNote}
              onSave={b64 => onUpdateMapData({ voiceNote: b64 })}
              onDelete={() => onUpdateMapData({ voiceNote: undefined })}
            />

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={onEditInCRM}
                className="caesar-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1"
              >
                <Edit3 size={11} /> Edit Full Profile
              </button>
              <button
                onClick={() => setTab('log')}
                className="caesar-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1"
              >
                <MessageSquare size={11} /> Log Interaction
              </button>
              {contact.email && (
                <button
                  onClick={() => setShowCompose(true)}
                  className="caesar-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1"
                  title="Send Email"
                >
                  <Mail size={11} /> Send Email
                </button>
              )}
              {contact.email && (
                <button
                  onClick={() => setShowThread(true)}
                  className="caesar-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1"
                  title="View Email History"
                >
                  <Inbox size={11} /> View Emails
                </button>
              )}
            </div>
          </>
        )}

        {tab === 'log' && (
          <>
            <div>
              <div className="caesar-label">Date</div>
              <input type="date" className="caesar-input" value={logDate} onChange={e => setLogDate(e.target.value)} />
            </div>
            <div>
              <div className="caesar-label">Type</div>
              <select className="caesar-select" value={logType} onChange={e => setLogType(e.target.value)}>
                {INTERACTION_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div className="caesar-label">Notes</div>
              <textarea
                className="caesar-textarea"
                rows={3}
                placeholder="What happened..."
                value={logNotes}
                onChange={e => setLogNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={logInteraction} className="caesar-btn-primary flex-1">Save</button>
              <button onClick={() => setTab('info')} className="caesar-btn-ghost">Cancel</button>
            </div>
          </>
        )}
      </div>

      {/* Email modals — rendered outside the card so they aren't clipped */}
      {showCompose && contact.email && (
        <EmailComposeModal
          to={contact.email}
          toName={contact.name}
          onSent={() => setShowCompose(false)}
          onClose={() => setShowCompose(false)}
        />
      )}
      {showThread && contact.email && (
        <EmailThread
          email={contact.email}
          contactName={contact.name}
          onClose={() => setShowThread(false)}
          onCompose={() => { setShowThread(false); setShowCompose(true); }}
        />
      )}
    </div>
  );
}
