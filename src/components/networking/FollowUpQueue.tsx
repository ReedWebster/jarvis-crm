import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ChevronDown, ChevronUp, Clock, CheckCircle } from 'lucide-react';
import type { Contact } from '../../types';
import { generateId, todayStr } from '../../utils';
import { getFollowUpUrgency } from '../../utils/networkingMap';

interface Props {
  contacts: Contact[];
  onUpdateContact: (updated: Contact) => void;
  onSelectContact: (contactId: string) => void;
}

const URGENCY_COLOR: Record<string, string> = {
  overdue:  '#dc2626',
  today:    '#d97706',
  upcoming: 'var(--text-muted)',
};

const URGENCY_LABEL: Record<string, string> = {
  overdue:  'Overdue',
  today:    'Due Today',
  upcoming: 'Upcoming',
};

export function FollowUpQueue({ contacts, onUpdateContact, onSelectContact }: Props) {
  const [open, setOpen] = useState(true);
  const [logPrompt, setLogPrompt] = useState<string | null>(null); // contactId

  const queue = contacts
    .filter(c => c.followUpNeeded && c.followUpDate)
    .map(c => ({ contact: c, urgency: getFollowUpUrgency(c)! }))
    .filter(x => x.urgency !== null)
    .sort((a, b) => {
      const order = { overdue: 0, today: 1, upcoming: 2 };
      if (order[a.urgency] !== order[b.urgency]) return order[a.urgency] - order[b.urgency];
      return (a.contact.followUpDate ?? '').localeCompare(b.contact.followUpDate ?? '');
    });

  const markDone = (contact: Contact) => {
    const updated: Contact = { ...contact, followUpNeeded: false, followUpDate: '' };
    onUpdateContact(updated);
    setLogPrompt(contact.id);
  };

  const logAndDismiss = (contact: Contact) => {
    const interaction = {
      id: generateId(),
      date: todayStr(),
      type: 'Follow-up',
      notes: 'Follow-up completed from Networking Map.',
    };
    const updated: Contact = {
      ...contact,
      followUpNeeded: false,
      followUpDate: '',
      lastContacted: todayStr(),
      interactions: [interaction, ...contact.interactions],
    };
    onUpdateContact(updated);
    setLogPrompt(null);
  };

  return (
    <div
      className="flex flex-col rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between px-4 py-3 text-sm font-semibold"
        style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-card)' }}
      >
        <div className="flex items-center gap-2">
          <Clock size={14} style={{ color: 'var(--text-muted)' }} />
          Follow-Up Queue
          {queue.length > 0 && (
            <span
              className="px-1.5 py-0.5 rounded text-xs font-bold"
              style={{ backgroundColor: '#dc2626', color: '#fff' }}
            >
              {queue.length}
            </span>
          )}
        </div>
        {open ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {open && (
        <div className="overflow-y-auto max-h-64">
          {queue.length === 0 ? (
            <div className="px-4 pb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
              No pending follow-ups.
            </div>
          ) : (
            queue.map(({ contact, urgency }) => (
              <div
                key={contact.id}
                className="px-4 py-2.5 border-t"
                style={{ borderColor: 'var(--border)' }}
              >
                {logPrompt === contact.id ? (
                  <div className="flex flex-col gap-2">
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Log this interaction?
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => logAndDismiss(contact)}
                        className="flex-1 text-xs py-1 rounded-lg border"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-elevated)' }}
                      >
                        Yes, Log It
                      </button>
                      <button
                        onClick={() => setLogPrompt(null)}
                        className="flex-1 text-xs py-1 rounded-lg border"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', backgroundColor: 'transparent' }}
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSelectContact(contact.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {contact.name}
                      </div>
                      <div className="text-xs flex items-center gap-1" style={{ color: URGENCY_COLOR[urgency] }}>
                        <span>{URGENCY_LABEL[urgency]}</span>
                        {contact.followUpDate && (
                          <span>· {format(parseISO(contact.followUpDate), 'MMM d')}</span>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => markDone(contact)}
                      className="flex-shrink-0 p-1 rounded"
                      style={{ color: '#22c55e' }}
                      title="Mark complete"
                    >
                      <CheckCircle size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
