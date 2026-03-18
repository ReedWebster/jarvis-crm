import React, { useState, useMemo, useCallback } from 'react';
import {
  Send, RefreshCw, X, ChevronDown, ChevronRight, Sparkles,
  Clock, Building, User, AlertCircle, Check, SkipForward, Mail,
  MessageSquare, Copy, Phone,
} from 'lucide-react';
import { differenceInDays, parseISO, format } from 'date-fns';
import type { Contact, ContactInteraction, Project } from '../../types';
import { calcRelationshipHealth, getHealthColor, generateId, todayStr } from '../../utils';
import { useGmail } from '../../hooks/useGmail';
import { useSupabaseStorage } from '../../hooks/useSupabaseStorage';
import { useToast } from '../shared/Toast';

// ─── Types ───────────────────────────────────────────────────────────────────

type Channel = 'email' | 'imessage';

interface OutreachDraft {
  contactId: string;
  subject: string;
  message: string;
  reasoning: string;
  channel: Channel;
}

interface OutreachHistoryEntry {
  contactId: string;
  sentAt: string;
  subject: string;
  channel?: Channel;
}

interface OutreachSettings {
  staleDays: number;
  defaultTone: 'casual' | 'professional' | 'warm';
}

type Tone = 'casual' | 'professional' | 'warm';

interface OutreachCoachProps {
  contacts: Contact[];
  setContacts: (v: Contact[] | ((p: Contact[]) => Contact[])) => void;
  projects: Project[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function OutreachCoach({ contacts, setContacts, projects }: OutreachCoachProps) {
  const { sendEmail, isConnected: gmailConnected, connect: connectGmail, isLoading: gmailLoading } = useGmail();
  const toast = useToast();

  // Persisted settings & history
  const [settings, setSettings] = useSupabaseStorage<OutreachSettings>('jarvis:outreachSettings', {
    staleDays: 30,
    defaultTone: 'warm',
  });
  const [history, setHistory] = useSupabaseStorage<OutreachHistoryEntry[]>('jarvis:outreachHistory', []);

  // Local UI state
  const [staleDays, setStaleDays] = useState(settings.staleDays);
  const [tone, setTone] = useState<Tone>(settings.defaultTone);
  const [drafts, setDrafts] = useState<OutreachDraft[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Editable draft fields (keyed by contactId)
  const [editedSubjects, setEditedSubjects] = useState<Record<string, string>>({});
  const [editedMessages, setEditedMessages] = useState<Record<string, string>>({});

  // ─── Stale contacts (now includes phone-only contacts) ──────────────────

  const staleContacts = useMemo(() => {
    const now = new Date();
    return contacts
      .filter(c => {
        if (!c.email && !c.phone) return false; // need at least one channel
        if (dismissedIds.has(c.id)) return false;
        const days = differenceInDays(now, parseISO(c.lastContacted));
        return days >= staleDays;
      })
      .sort((a, b) => parseISO(a.lastContacted).getTime() - parseISO(b.lastContacted).getTime());
  }, [contacts, staleDays, dismissedIds]);

  const contactsWithNoChannel = useMemo(() => {
    const now = new Date();
    return contacts.filter(c => {
      if (c.email || c.phone) return false;
      const days = differenceInDays(now, parseISO(c.lastContacted));
      return days >= staleDays;
    }).length;
  }, [contacts, staleDays]);

  // ─── Draft helpers ────────────────────────────────────────────────────────

  const getDraftForContact = useCallback((contactId: string): OutreachDraft | undefined => {
    return drafts.find(d => d.contactId === contactId);
  }, [drafts]);

  const getEditedSubject = (contactId: string, draft?: OutreachDraft) =>
    editedSubjects[contactId] ?? draft?.subject ?? '';

  const getEditedMessage = (contactId: string, draft?: OutreachDraft) =>
    editedMessages[contactId] ?? draft?.message ?? '';

  // ─── Generate drafts ──────────────────────────────────────────────────────

  const generateDrafts = useCallback(async (contactIds?: string[]) => {
    const targets = contactIds
      ? staleContacts.filter(c => contactIds.includes(c.id))
      : staleContacts.slice(0, 10);

    if (targets.length === 0) return;

    setLoading(true);
    setError(null);

    const projectMap = new Map(projects.map(p => [p.id, p.name]));

    const payload = targets.map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      company: c.company,
      relationship: c.relationship,
      tags: c.tags,
      metAt: c.metAt,
      lastContacted: c.lastContacted,
      daysSinceContact: differenceInDays(new Date(), parseISO(c.lastContacted)),
      recentInteractions: c.interactions.slice(-5).reverse(),
      linkedProjects: c.linkedProjects.map(id => projectMap.get(id) ?? id),
      notes: c.notes,
      hasEmail: !!c.email,
      hasPhone: !!c.phone,
    }));

    try {
      const res = await fetch('/api/outreach-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: payload, tone }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error ?? `Request failed: ${res.status}`);
      }

      const { drafts: newDrafts } = await res.json();

      // Merge new drafts, replacing any existing ones for the same contacts
      setDrafts(prev => {
        const updated = [...prev];
        for (const d of newDrafts) {
          const idx = updated.findIndex(e => e.contactId === d.contactId);
          if (idx >= 0) updated[idx] = d;
          else updated.push(d);
        }
        return updated;
      });

      // Clear edited overrides for regenerated contacts
      const regenIds = new Set(targets.map(c => c.id));
      setEditedSubjects(prev => {
        const next = { ...prev };
        for (const id of regenIds) delete next[id];
        return next;
      });
      setEditedMessages(prev => {
        const next = { ...prev };
        for (const id of regenIds) delete next[id];
        return next;
      });

      // Auto-select first if nothing selected
      if (!selectedContactId && newDrafts.length > 0) {
        setSelectedContactId(newDrafts[0].contactId);
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to generate drafts');
    } finally {
      setLoading(false);
    }
  }, [staleContacts, projects, tone, selectedContactId]);

  // ─── Send email ───────────────────────────────────────────────────────────

  const handleSend = useCallback(async (contact: Contact) => {
    if (!contact.email) return;

    const draft = getDraftForContact(contact.id);
    const subject = getEditedSubject(contact.id, draft);
    const message = getEditedMessage(contact.id, draft);
    if (!subject || !message) return;

    setSendingId(contact.id);
    try {
      await sendEmail(contact.email, subject, message);

      // Update contact's lastContacted + add interaction
      const today = todayStr();
      setContacts(prev =>
        prev.map(c =>
          c.id === contact.id
            ? {
                ...c,
                lastContacted: today,
                followUpNeeded: false,
                interactions: [
                  ...c.interactions,
                  {
                    id: generateId(),
                    date: today,
                    type: 'email',
                    notes: `Outreach: ${subject}`,
                  } satisfies ContactInteraction,
                ],
              }
            : c
        )
      );

      // Record in outreach history
      setHistory(prev => [
        { contactId: contact.id, sentAt: new Date().toISOString(), subject, channel: 'email' as Channel },
        ...prev,
      ]);

      // Remove draft & dismiss from queue
      setDrafts(prev => prev.filter(d => d.contactId !== contact.id));
      setDismissedIds(prev => new Set([...prev, contact.id]));

      // Select next contact
      const remaining = staleContacts.filter(c => c.id !== contact.id);
      setSelectedContactId(remaining[0]?.id ?? null);

      toast.success(`Email sent to ${contact.name}`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to send email');
    } finally {
      setSendingId(null);
    }
  }, [getDraftForContact, editedSubjects, editedMessages, sendEmail, setContacts, setHistory, staleContacts, toast]);

  // ─── Copy iMessage draft ─────────────────────────────────────────────────

  const handleCopyText = useCallback(async (contact: Contact) => {
    const draft = getDraftForContact(contact.id);
    const message = getEditedMessage(contact.id, draft);
    if (!message) return;

    try {
      await navigator.clipboard.writeText(message);

      // Update contact's lastContacted + add interaction
      const today = todayStr();
      const subject = getEditedSubject(contact.id, draft);
      setContacts(prev =>
        prev.map(c =>
          c.id === contact.id
            ? {
                ...c,
                lastContacted: today,
                followUpNeeded: false,
                interactions: [
                  ...c.interactions,
                  {
                    id: generateId(),
                    date: today,
                    type: 'imessage',
                    notes: `Outreach text: ${subject}`,
                  } satisfies ContactInteraction,
                ],
              }
            : c
        )
      );

      // Record in outreach history
      setHistory(prev => [
        { contactId: contact.id, sentAt: new Date().toISOString(), subject: subject || '(text)', channel: 'imessage' as Channel },
        ...prev,
      ]);

      // Remove draft & dismiss
      setDrafts(prev => prev.filter(d => d.contactId !== contact.id));
      setDismissedIds(prev => new Set([...prev, contact.id]));

      const remaining = staleContacts.filter(c => c.id !== contact.id);
      setSelectedContactId(remaining[0]?.id ?? null);

      toast.success(`Text copied — open Messages and send to ${contact.name}`);
    } catch (err: any) {
      toast.error('Failed to copy to clipboard');
    }
  }, [getDraftForContact, editedSubjects, editedMessages, setContacts, setHistory, staleContacts, toast]);

  // ─── Skip contact ─────────────────────────────────────────────────────────

  const handleSkip = useCallback((contactId: string) => {
    setDismissedIds(prev => new Set([...prev, contactId]));
    setDrafts(prev => prev.filter(d => d.contactId !== contactId));
    const remaining = staleContacts.filter(c => c.id !== contactId);
    setSelectedContactId(remaining.length > 0 ? remaining[0].id : null);
  }, [staleContacts]);

  // ─── Save settings on threshold/tone change ──────────────────────────────

  const updateStaleDays = (days: number) => {
    setStaleDays(days);
    setSettings(prev => ({ ...prev, staleDays: days }));
  };

  const updateTone = (t: Tone) => {
    setTone(t);
    setSettings(prev => ({ ...prev, defaultTone: t }));
  };

  // ─── Selected contact & draft ─────────────────────────────────────────────

  const selectedContact = staleContacts.find(c => c.id === selectedContactId);
  const selectedDraft = selectedContact ? getDraftForContact(selectedContact.id) : undefined;

  // ─── Channel helpers ──────────────────────────────────────────────────────

  const getContactChannels = (contact: Contact): Channel[] => {
    const channels: Channel[] = [];
    if (contact.email) channels.push('email');
    if (contact.phone) channels.push('imessage');
    return channels;
  };

  const channelIcon = (ch: Channel) =>
    ch === 'imessage' ? <MessageSquare size={10} /> : <Mail size={10} />;

  const channelLabel = (ch: Channel) =>
    ch === 'imessage' ? 'iMessage' : 'Email';

  const channelColor = (ch: Channel) =>
    ch === 'imessage' ? { bg: 'rgba(52,199,89,0.15)', text: '#34c759' } : { bg: 'rgba(52,211,153,0.15)', text: '#34d399' };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div
        className="rounded-xl p-4 sm:p-5"
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={20} style={{ color: 'var(--accent, #f59e0b)' }} />
            <h2 className="text-lg font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              Outreach Coach
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg)', color: 'var(--text-muted)' }}>
              {staleContacts.length} stale
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
            {/* Staleness threshold */}
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Clock size={14} />
              <span>{staleDays}d+</span>
              <input
                type="range"
                min={7}
                max={180}
                step={1}
                value={staleDays}
                onChange={e => updateStaleDays(Number(e.target.value))}
                className="w-20 accent-amber-500"
              />
            </label>

            {/* Tone selector */}
            <select
              value={tone}
              onChange={e => updateTone(e.target.value as Tone)}
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{
                backgroundColor: 'var(--bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            >
              <option value="casual">Casual</option>
              <option value="warm">Warm</option>
              <option value="professional">Professional</option>
            </select>

            {/* Generate button */}
            <button
              onClick={() => generateDrafts()}
              disabled={loading || staleContacts.length === 0}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              style={{
                backgroundColor: 'var(--accent, #f59e0b)',
                color: '#000',
              }}
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {loading ? 'Generating...' : 'Generate Drafts'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-xs rounded-lg px-3 py-2" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {contactsWithNoChannel > 0 && (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            {contactsWithNoChannel} stale contact{contactsWithNoChannel > 1 ? 's' : ''} without email or phone excluded
          </p>
        )}
      </div>

      {/* Main two-panel layout */}
      {staleContacts.length === 0 && drafts.length === 0 ? (
        <div
          className="rounded-xl p-8 text-center"
          style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}
        >
          <Check size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            No stale contacts
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            All contacts have been reached within the last {staleDays} days.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left panel — contact queue */}
          <div
            className="lg:col-span-2 rounded-xl overflow-hidden"
            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}
          >
            <div className="px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
              Stale Contacts ({staleContacts.length})
            </div>
            <div className="max-h-[calc(100vh-320px)] overflow-y-auto divide-y" style={{ borderColor: 'var(--border)' }}>
              {staleContacts.map(contact => {
                const days = differenceInDays(new Date(), parseISO(contact.lastContacted));
                const health = calcRelationshipHealth(contact.lastContacted);
                const draft = getDraftForContact(contact.id);
                const isSelected = contact.id === selectedContactId;
                const channels = getContactChannels(contact);

                return (
                  <button
                    key={contact.id}
                    onClick={() => setSelectedContactId(contact.id)}
                    className="w-full text-left px-4 py-3 transition-colors hover:brightness-95"
                    style={{
                      backgroundColor: isSelected ? 'var(--bg)' : 'transparent',
                      borderColor: 'var(--border)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {contact.name}
                          </span>
                          {draft && (() => {
                            const cc = channelColor(draft.channel);
                            return (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1"
                                style={{ backgroundColor: cc.bg, color: cc.text }}>
                                {channelIcon(draft.channel)}
                                draft
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {contact.company && (
                            <span className="text-xs flex items-center gap-1 truncate" style={{ color: 'var(--text-muted)' }}>
                              <Building size={10} />
                              {contact.company}
                            </span>
                          )}
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {days}d ago
                          </span>
                          {/* Channel indicators */}
                          <span className="flex items-center gap-1">
                            {channels.map(ch => (
                              <span key={ch} className="text-[10px]" style={{ color: 'var(--text-muted)' }} title={channelLabel(ch)}>
                                {channelIcon(ch)}
                              </span>
                            ))}
                          </span>
                        </div>
                      </div>

                      {/* Health bar */}
                      <div className="flex flex-col items-end gap-1">
                        <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${health}%`,
                              backgroundColor: getHealthColor(health),
                            }}
                          />
                        </div>
                        <span className="text-[10px]" style={{ color: getHealthColor(health) }}>
                          {health}%
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right panel — draft editor */}
          <div
            className="lg:col-span-3 rounded-xl"
            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}
          >
            {selectedContact && selectedDraft ? (
              <div className="p-4 sm:p-5 space-y-4">
                {/* Contact header */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {selectedContact.name}
                      </h3>
                      {/* Channel badge */}
                      {(() => {
                        const cc = channelColor(selectedDraft.channel);
                        return (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1"
                            style={{ backgroundColor: cc.bg, color: cc.text }}>
                            {channelIcon(selectedDraft.channel)}
                            {channelLabel(selectedDraft.channel)}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {selectedDraft.channel === 'imessage' ? selectedContact.phone : selectedContact.email}
                      {selectedContact.company && ` · ${selectedContact.company}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => generateDrafts([selectedContact.id])}
                      disabled={loading}
                      className="p-1.5 rounded-lg transition-colors hover:brightness-90"
                      style={{ backgroundColor: 'var(--bg)', color: 'var(--text-muted)' }}
                      title="Regenerate draft"
                    >
                      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={() => handleSkip(selectedContact.id)}
                      className="p-1.5 rounded-lg transition-colors hover:brightness-90"
                      style={{ backgroundColor: 'var(--bg)', color: 'var(--text-muted)' }}
                      title="Skip this contact"
                    >
                      <SkipForward size={14} />
                    </button>
                  </div>
                </div>

                {/* Reasoning */}
                {selectedDraft.reasoning && (
                  <div className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg)', color: 'var(--text-muted)' }}>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Approach:</span>{' '}
                    {selectedDraft.reasoning}
                  </div>
                )}

                {/* Subject (shown for both channels — serves as a label for iMessage) */}
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
                    {selectedDraft.channel === 'imessage' ? 'Topic' : 'Subject'}
                  </label>
                  <input
                    type="text"
                    value={getEditedSubject(selectedContact.id, selectedDraft)}
                    onChange={e => setEditedSubjects(prev => ({ ...prev, [selectedContact.id]: e.target.value }))}
                    className="w-full text-sm rounded-lg px-3 py-2 outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--bg)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                    }}
                  />
                </div>

                {/* Message body */}
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
                    {selectedDraft.channel === 'imessage' ? 'Text Message' : 'Message'}
                  </label>
                  <textarea
                    value={getEditedMessage(selectedContact.id, selectedDraft)}
                    onChange={e => setEditedMessages(prev => ({ ...prev, [selectedContact.id]: e.target.value }))}
                    rows={selectedDraft.channel === 'imessage' ? 3 : 6}
                    className="w-full text-sm rounded-lg px-3 py-2 outline-none resize-y transition-colors"
                    style={{
                      backgroundColor: 'var(--bg)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                    }}
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  {selectedDraft.channel === 'imessage' ? (
                    <>
                      {/* Copy text for iMessage */}
                      <button
                        onClick={() => handleCopyText(selectedContact)}
                        className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                        style={{ backgroundColor: '#34c759', color: '#fff' }}
                      >
                        <Copy size={14} />
                        Copy & Mark Sent
                      </button>
                      {/* Open in Messages (macOS) */}
                      {selectedContact.phone && (
                        <a
                          href={`sms:${selectedContact.phone}`}
                          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
                          style={{ backgroundColor: 'var(--bg)', color: 'var(--text-muted)' }}
                        >
                          <MessageSquare size={14} />
                          Open Messages
                        </a>
                      )}
                    </>
                  ) : gmailConnected ? (
                    <button
                      onClick={() => handleSend(selectedContact)}
                      disabled={sendingId === selectedContact.id || gmailLoading}
                      className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
                      style={{ backgroundColor: 'var(--accent, #f59e0b)', color: '#000' }}
                    >
                      {sendingId === selectedContact.id ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                      {sendingId === selectedContact.id ? 'Sending...' : 'Send via Gmail'}
                    </button>
                  ) : (
                    <button
                      onClick={connectGmail}
                      className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                      style={{ backgroundColor: 'var(--accent, #f59e0b)', color: '#000' }}
                    >
                      <Mail size={14} />
                      Connect Gmail to Send
                    </button>
                  )}
                  <button
                    onClick={() => handleSkip(selectedContact.id)}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
                    style={{ backgroundColor: 'var(--bg)', color: 'var(--text-muted)' }}
                  >
                    <SkipForward size={14} />
                    Skip
                  </button>
                </div>
              </div>
            ) : selectedContact && !selectedDraft ? (
              <div className="p-8 text-center">
                <Sparkles size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  No draft yet for {selectedContact.name}
                </p>
                <p className="text-xs mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>
                  Generate drafts to get a personalized re-engagement message.
                </p>
                <button
                  onClick={() => generateDrafts([selectedContact.id])}
                  disabled={loading}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--accent, #f59e0b)', color: '#000' }}
                >
                  {loading ? 'Generating...' : 'Generate Draft'}
                </button>
              </div>
            ) : (
              <div className="p-8 text-center">
                <User size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Select a contact to view or edit their draft
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sent history */}
      {history.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}
        >
          <button
            onClick={() => setShowHistory(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-medium transition-colors hover:brightness-95"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>Sent History ({history.length})</span>
            {showHistory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {showHistory && (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {history.slice(0, 20).map((entry, i) => {
                const contact = contacts.find(c => c.id === entry.contactId);
                const ch = entry.channel ?? 'email';
                return (
                  <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                    {ch === 'imessage' ? (
                      <MessageSquare size={12} style={{ color: '#34c759' }} />
                    ) : (
                      <Check size={12} style={{ color: '#34d399' }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium truncate block" style={{ color: 'var(--text-primary)' }}>
                        {contact?.name ?? 'Unknown'}
                      </span>
                      <span className="text-[11px] truncate block" style={{ color: 'var(--text-muted)' }}>
                        {entry.subject}
                      </span>
                    </div>
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {format(new Date(entry.sentAt), 'MMM d')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
