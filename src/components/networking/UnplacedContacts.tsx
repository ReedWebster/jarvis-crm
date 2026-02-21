import React, { useState } from 'react';
import { ChevronDown, ChevronUp, MapPin, Users } from 'lucide-react';
import type { Contact } from '../../types';
import { getContactInitials } from '../../utils/networkingMap';

interface Props {
  contacts: Contact[];
  onPlaceContact: (contactId: string) => void;
}

export function UnplacedContacts({ contacts, onPlaceContact }: Props) {
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState('');

  const filtered = contacts.filter(c =>
    !search.trim() || c.name.toLowerCase().includes(search.toLowerCase()),
  );

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
          <Users size={14} style={{ color: 'var(--text-muted)' }} />
          Unplaced Contacts
          {contacts.length > 0 && (
            <span
              className="px-1.5 py-0.5 rounded text-xs font-bold"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              {contacts.length}
            </span>
          )}
        </div>
        {open ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {open && (
        <>
          {contacts.length > 4 && (
            <div className="px-3 pb-2">
              <input
                className="caesar-input text-xs"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}
          <div className="overflow-y-auto max-h-64">
            {filtered.length === 0 ? (
              <div className="px-4 pb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                {contacts.length === 0 ? 'All contacts are placed!' : 'No matches.'}
              </div>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => onPlaceContact(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 border-t text-left transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ borderColor: 'var(--border)' }}
                  title="Click to enter placement mode"
                >
                  <div
                    className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                  >
                    {getContactInitials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{c.relationship || c.tags[0] || ''}</div>
                  </div>
                  <MapPin size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
