import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  Calendar,
  Mail,
  Phone,
  Building,
  Clock,
  Heart,
  MessageSquare,
  TrendingUp,
  User,
  Star,
  Filter,
  ChevronDown,
  Upload,
} from 'lucide-react';
import Papa from 'papaparse';
import { format, parseISO, differenceInDays, isWithinInterval, addDays } from 'date-fns';
import type { Contact, ContactTag, ContactInteraction } from '../../types';
import { generateId, todayStr, calcRelationshipHealth, getHealthColor, formatDate } from '../../utils';
import { useToast } from '../shared/Toast';
import { Modal } from '../shared/Modal';
import { Badge } from '../shared/Badge';

// ─── TAG COLORS ───────────────────────────────────────────────────────────────

const TAG_COLORS: Record<ContactTag, string> = {
  Investor: 'var(--text-muted)',
  Professor: 'var(--text-muted)',
  Resident: 'var(--text-muted)',
  Partner: 'var(--text-muted)',
  Friend: 'var(--text-secondary)',
  Recruit: 'var(--text-muted)',
  Mentor: 'var(--text-muted)',
  Client: 'var(--text-muted)',
  Colleague: 'var(--text-muted)',
  Family: 'var(--text-secondary)',
  Other: '#6b7280',
};

const ALL_TAGS: ContactTag[] = [
  'Investor', 'Professor', 'Resident', 'Partner', 'Friend',
  'Recruit', 'Mentor', 'Client', 'Colleague', 'Family', 'Other',
];

const INTERACTION_TYPES = ['Call', 'Email', 'Meeting', 'Text', 'LinkedIn'];

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  contacts: Contact[];
  setContacts: (v: Contact[] | ((p: Contact[]) => Contact[])) => void;
}

// ─── EMPTY FORMS ─────────────────────────────────────────────────────────────

function emptyContact(): Omit<Contact, 'id' | 'interactions' | 'linkedProjects'> {
  return {
    name: '',
    email: '',
    phone: '',
    company: '',
    relationship: '',
    tags: [],
    lastContacted: todayStr(),
    followUpDate: '',
    followUpNeeded: false,
    birthday: '',
    anniversary: '',
    notes: '',
  };
}

function emptyInteraction(): Omit<ContactInteraction, 'id'> {
  return { date: todayStr(), type: 'Call', notes: '' };
}

// ─── HEALTH CIRCLE ───────────────────────────────────────────────────────────

function HealthCircle({ score }: { score: number }) {
  const color = getHealthColor(score);
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 44, height: 44 }}>
      <svg width="44" height="44" className="rotate-[-90deg]">
        <circle
          cx="22" cy="22" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="3"
        />
        <circle
          cx="22" cy="22" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <span
        className="absolute text-xs font-bold"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
}

// ─── STATS ROW ────────────────────────────────────────────────────────────────

function StatsRow({ contacts }: { contacts: Contact[] }) {
  const now = new Date();
  const followUpCount = contacts.filter((c) => c.followUpNeeded).length;

  const birthdaysThisMonth = contacts.filter((c) => {
    if (!c.birthday) return false;
    try {
      const bDay = parseISO(c.birthday);
      return bDay.getMonth() === now.getMonth();
    } catch { return false; }
  }).length;

  const avgHealth = contacts.length
    ? Math.round(
        contacts.reduce((sum, c) => sum + calcRelationshipHealth(c.lastContacted), 0) /
          contacts.length
      )
    : 0;

  const stats = [
    { label: 'Total Contacts', value: contacts.length, icon: User, color: 'var(--text-muted)' },
    { label: 'Follow Up Needed', value: followUpCount, icon: Clock, color: 'var(--text-secondary)' },
    { label: 'Birthdays This Month', value: birthdaysThisMonth, icon: Calendar, color: 'var(--text-muted)' },
    { label: 'Avg Health Score', value: `${avgHealth}`, icon: Heart, color: getHealthColor(avgHealth) },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="caesar-card flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{ width: 40, height: 40, backgroundColor: `${color}20` }}
          >
            <Icon size={18} style={{ color }} />
          </div>
          <div>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── CONTACT CARD ─────────────────────────────────────────────────────────────

interface ContactCardProps {
  contact: Contact;
  onEdit: () => void;
  onDelete: () => void;
  onDetail: () => void;
  onLogInteraction: () => void;
}

function ContactCard({ contact, onEdit, onDelete, onDetail, onLogInteraction }: ContactCardProps) {
  const health = calcRelationshipHealth(contact.lastContacted);
  const daysAgo = useMemo(() => {
    try {
      return differenceInDays(new Date(), parseISO(contact.lastContacted));
    } catch { return 0; }
  }, [contact.lastContacted]);

  const hasBirthdaySoon = useMemo(() => {
    if (!contact.birthday) return false;
    try {
      const today = new Date();
      const bDay = parseISO(contact.birthday);
      const thisYearBDay = new Date(today.getFullYear(), bDay.getMonth(), bDay.getDate());
      return isWithinInterval(thisYearBDay, { start: today, end: addDays(today, 30) });
    } catch { return false; }
  }, [contact.birthday]);

  return (
    <div className="caesar-card group flex flex-col gap-3 hover:border-blue-500/40 transition-all duration-200">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <button
            onClick={onDetail}
            className="text-left text-base font-bold leading-tight truncate block w-full transition-colors duration-200"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            {contact.name}
          </button>
          {contact.company && (
            <div className="flex items-center gap-1 mt-0.5">
              <Building size={11} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                {contact.company}
              </span>
            </div>
          )}
          {contact.relationship && (
            <span className="text-xs mt-0.5 block" style={{ color: 'var(--text-muted)' }}>
              {contact.relationship}
            </span>
          )}
        </div>
        <HealthCircle score={health} />
      </div>

      {/* Tags */}
      {contact.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {contact.tags.map((tag) => (
            <Badge key={tag} label={tag} color={TAG_COLORS[tag]} size="xs" />
          ))}
        </div>
      )}

      {/* Status indicators */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Clock size={11} style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
          </span>
        </div>
        {contact.followUpNeeded && (
          <div className="flex items-center gap-1">
            <Calendar size={11} style={{ color: 'var(--text-secondary)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Follow up</span>
          </div>
        )}
        {hasBirthdaySoon && (
          <div className="flex items-center gap-1">
            <Star size={11} style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Birthday soon</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        className="flex items-center gap-1.5 pt-1 border-t transition-colors duration-300"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          onClick={onLogInteraction}
          className="caesar-btn-ghost flex-1 text-xs flex items-center justify-center gap-1 py-1.5"
        >
          <MessageSquare size={11} />
          Log
        </button>
        <button
          onClick={onEdit}
          className="caesar-btn-ghost flex-1 text-xs flex items-center justify-center gap-1 py-1.5"
        >
          <Edit3 size={11} />
          Edit
        </button>
        <button
          onClick={onDelete}
          className="text-xs flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg transition-colors hover:text-[var(--text-secondary)] "
          style={{ color: 'var(--text-muted)' }}
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

// ─── PHONE FORMATTING ────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  if (!raw) return '';
  // Pass international numbers (+...) through as-is
  if (raw.startsWith('+')) return raw;
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (!digits) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// ─── ADDRESS AUTOCOMPLETE (ArcGIS World Geocoding — USPS + county assessor data)

// ArcGIS World Geocoding Service: uses USPS, county assessors, HERE maps, and
// government parcel data — the most accurate US address source available for free.
const ARCGIS_BASE = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer';

interface ArcGISSuggestion {
  text: string;
  magicKey: string;
  isCollection: boolean;
}

/** Resolve a suggestion's magicKey (or any text address) to coordinates. */
async function arcgisGeocode(
  text: string,
  magicKey?: string
): Promise<{ lat: number; lng: number; label: string; formatted: string } | null> {
  try {
    const params = new URLSearchParams({
      singleLine: text,
      outFields: 'City,RegionAbbr,Postal',
      countryCode: 'USA',
      maxLocations: '1',
      f: 'json',
    });
    if (magicKey) params.set('magicKey', magicKey);
    const res = await fetch(`${ARCGIS_BASE}/findAddressCandidates?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const c = data.candidates?.[0];
    if (!c || !c.location) return null;
    const city = (c.attributes?.City ?? '') as string;
    const state = (c.attributes?.RegionAbbr ?? '') as string;
    const label = [city, state].filter(Boolean).join(', ');
    return { lat: c.location.y, lng: c.location.x, label, formatted: c.address ?? text };
  } catch {
    return null;
  }
}

function AddressAutocomplete({
  value,
  onChange,
}: {
  value: string;
  onChange: (address: string, lat?: number, lng?: number, label?: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<ArcGISSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    onChange(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          text: q,
          category: 'Address,Postal,City',
          countryCode: 'USA',
          maxSuggestions: '6',
          f: 'json',
        });
        const res = await fetch(`${ARCGIS_BASE}/suggest?${params}`);
        if (res.ok) {
          const data = await res.json();
          const list: ArcGISSuggestion[] = (data.suggestions ?? []).filter(
            (s: ArcGISSuggestion) => !s.isCollection
          );
          setSuggestions(list);
          setOpen(list.length > 0);
        }
      } catch { /* silently ignore */ }
      setLoading(false);
    }, 300);
  };

  const handleSelect = async (s: ArcGISSuggestion) => {
    setQuery(s.text);
    setSuggestions([]);
    setOpen(false);
    onChange(s.text); // optimistic update
    const result = await arcgisGeocode(s.text, s.magicKey);
    if (result) {
      setQuery(result.formatted);
      onChange(result.formatted, result.lat, result.lng, result.label);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="caesar-input w-full"
        placeholder="e.g. 123 Main St, Denver, CO"
        value={query}
        onChange={handleInput}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        autoComplete="off"
      />
      {loading && (
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-muted)', pointerEvents: 'none' }}>
          Searching…
        </span>
      )}
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, marginTop: 4, overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
        }}>
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => handleSelect(s)}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 12px',
                display: 'block', backgroundColor: 'transparent',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: 12, color: 'var(--text-primary)',
              }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
            >
              {s.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ADD/EDIT CONTACT MODAL ───────────────────────────────────────────────────

interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  mapLat?: number;
  mapLng?: number;
  mapLabel?: string;
  relationship: string;
  tags: ContactTag[];
  lastContacted: string;
  followUpDate: string;
  followUpNeeded: boolean;
  birthday: string;
  anniversary: string;
  notes: string;
}

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ContactFormData) => void;
  initial?: Partial<ContactFormData>;
  title: string;
}

function ContactFormModal({ isOpen, onClose, onSave, initial, title }: ContactFormModalProps) {
  const emptyForm = (): ContactFormData => ({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    company: initial?.company ?? '',
    address: initial?.address ?? '',
    mapLat: initial?.mapLat,
    mapLng: initial?.mapLng,
    mapLabel: initial?.mapLabel,
    relationship: initial?.relationship ?? '',
    tags: initial?.tags ?? [],
    lastContacted: initial?.lastContacted ?? todayStr(),
    followUpDate: initial?.followUpDate ?? '',
    followUpNeeded: initial?.followUpNeeded ?? false,
    birthday: initial?.birthday ?? '',
    anniversary: initial?.anniversary ?? '',
    notes: initial?.notes ?? '',
  });

  const [form, setForm] = useState<ContactFormData>(emptyForm);

  // Sync form when initial changes (e.g. opening edit for different contact)
  React.useEffect(() => {
    if (isOpen) setForm(emptyForm());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const toggleTag = (tag: ContactTag) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* ── Basic Info ── */}
        <div className="flex items-center gap-3">
          <p className="caesar-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Basic Info</p>
          <hr className="caesar-divider flex-1" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="caesar-label">Name *</label>
            <input
              className="caesar-input w-full"
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="caesar-label">Relationship</label>
            <input
              className="caesar-input w-full"
              placeholder="e.g. Business contact"
              value={form.relationship}
              onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="caesar-label">Email</label>
            <input
              className="caesar-input w-full"
              type="email"
              placeholder="email@example.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="caesar-label">Phone</label>
            <input
              className="caesar-input w-full"
              type="tel"
              placeholder="(555) 000-0000"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))}
            />
          </div>
        </div>
        <div>
          <label className="caesar-label">Company / Organization</label>
          <input
            className="caesar-input w-full"
            placeholder="Company name"
            value={form.company}
            onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
          />
        </div>
        <div>
          <label className="caesar-label">
            Address{' '}
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
              — auto-pins on Networking Map
            </span>
          </label>
          <AddressAutocomplete
            value={form.address}
            onChange={(address, lat, lng, label) =>
              setForm((f) => ({ ...f, address, mapLat: lat, mapLng: lng, mapLabel: label }))
            }
          />
        </div>

        {/* ── Relationship ── */}
        <div className="flex items-center gap-3 mt-1">
          <p className="caesar-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Relationship</p>
          <hr className="caesar-divider flex-1" />
        </div>
        <div>
          <label className="caesar-label">Tags</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {ALL_TAGS.map((tag) => {
              const selected = form.tags.includes(tag);
              const color = TAG_COLORS[tag];
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150"
                  style={{
                    backgroundColor: selected ? `${color}30` : 'var(--bg-elevated)',
                    color: selected ? color : 'var(--text-muted)',
                    border: `1px solid ${selected ? color + '60' : 'var(--border)'}`,
                  }}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setForm((f) => ({ ...f, followUpNeeded: !f.followUpNeeded }))}
            className="relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0"
            style={{ backgroundColor: form.followUpNeeded ? 'var(--text-muted)' : 'var(--bg-elevated)' }}
          >
            <div
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
              style={{ transform: form.followUpNeeded ? 'translateX(20px)' : 'translateX(0)' }}
            />
          </div>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Follow Up Needed</span>
        </label>

        {/* ── Dates ── */}
        <div className="flex items-center gap-3 mt-1">
          <p className="caesar-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Dates</p>
          <hr className="caesar-divider flex-1" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="caesar-label">Last Contacted</label>
            <input
              className="caesar-input w-full"
              type="date"
              value={form.lastContacted}
              onChange={(e) => setForm((f) => ({ ...f, lastContacted: e.target.value }))}
            />
          </div>
          <div>
            <label className="caesar-label">Follow Up Date</label>
            <input
              className="caesar-input w-full"
              type="date"
              value={form.followUpDate}
              onChange={(e) => setForm((f) => ({ ...f, followUpDate: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="caesar-label">Birthday</label>
            <input
              className="caesar-input w-full"
              type="date"
              value={form.birthday}
              onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))}
            />
          </div>
          <div>
            <label className="caesar-label">Anniversary</label>
            <input
              className="caesar-input w-full"
              type="date"
              value={form.anniversary}
              onChange={(e) => setForm((f) => ({ ...f, anniversary: e.target.value }))}
            />
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="flex items-center gap-3 mt-1">
          <p className="caesar-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Notes</p>
          <hr className="caesar-divider flex-1" />
        </div>
        <div>
          <textarea
            className="caesar-input w-full resize-none"
            rows={3}
            placeholder="Background, context, topics to discuss..."
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="caesar-btn-ghost">
            Cancel
          </button>
          <button type="submit" className="caesar-btn-primary">
            Save Contact
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── CONTACT DETAIL MODAL ─────────────────────────────────────────────────────

interface ContactDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  onUpdate: (updated: Contact) => void;
}

function ContactDetailModal({ isOpen, onClose, contact, onUpdate }: ContactDetailModalProps) {
  const [newInteraction, setNewInteraction] = useState<Omit<ContactInteraction, 'id'>>(emptyInteraction());
  const [showAddInteraction, setShowAddInteraction] = useState(false);

  if (!contact) return null;

  const health = calcRelationshipHealth(contact.lastContacted);
  const healthColor = getHealthColor(health);

  const handleAddInteraction = () => {
    if (!newInteraction.notes.trim() && !newInteraction.type) return;
    const interaction: ContactInteraction = {
      id: generateId(),
      ...newInteraction,
    };
    const updated: Contact = {
      ...contact,
      interactions: [interaction, ...contact.interactions],
      lastContacted: newInteraction.date,
    };
    onUpdate(updated);
    setNewInteraction(emptyInteraction());
    setShowAddInteraction(false);
  };

  const sortedInteractions = [...contact.interactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={contact.name} size="xl">
      <div className="flex flex-col gap-5">
        {/* Info grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            {contact.email && (
              <div className="flex items-center gap-2">
                <Mail size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <a href={`mailto:${contact.email}`} className="text-sm  hover:underline">
                  {contact.email}
                </a>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2">
                <Phone size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{contact.phone}</span>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-2">
                <Building size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{contact.company}</span>
              </div>
            )}
            {contact.relationship && (
              <div className="flex items-center gap-2">
                <User size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{contact.relationship}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {contact.birthday && (
              <div className="flex items-center gap-2">
                <Star size={14} style={{ color: 'var(--text-muted)' }} className="flex-shrink-0" />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Birthday: {formatDate(contact.birthday)}
                </span>
              </div>
            )}
            {contact.anniversary && (
              <div className="flex items-center gap-2">
                <Heart size={14} style={{ color: 'var(--text-muted)' }} className="flex-shrink-0" />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Anniversary: {formatDate(contact.anniversary)}
                </span>
              </div>
            )}
            {contact.followUpDate && (
              <div className="flex items-center gap-2">
                <Calendar
                  size={14}
                  style={{ color: contact.followUpNeeded ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                  className="flex-shrink-0"
                />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Follow up: {formatDate(contact.followUpDate)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tags */}
        {contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {contact.tags.map((tag) => (
              <Badge key={tag} label={tag} color={TAG_COLORS[tag]} />
            ))}
          </div>
        )}

        {/* Notes */}
        {contact.notes && (
          <div
            className="rounded-xl p-3 transition-colors duration-300"
            style={{ backgroundColor: 'var(--bg-elevated)' }}
          >
            <p
              className="text-xs mb-1 font-medium uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}
            >
              Notes
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {contact.notes}
            </p>
          </div>
        )}

        {/* Health Bar */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} style={{ color: healthColor }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Relationship Health
              </span>
            </div>
            <span className="text-sm font-bold" style={{ color: healthColor }}>{health}/100</span>
          </div>
          <div
            className="h-2 rounded-full transition-colors duration-300"
            style={{ backgroundColor: 'var(--bg-elevated)' }}
          >
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{ width: `${health}%`, backgroundColor: healthColor }}
            />
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Last contacted: {formatDate(contact.lastContacted)}
          </p>
        </div>

        {/* Interaction Timeline */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3
              className="text-sm font-semibold flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}
            >
              <MessageSquare size={14} style={{ color: 'var(--text-muted)' }} />
              Interaction History
            </h3>
            <button
              onClick={() => setShowAddInteraction((v) => !v)}
              className="caesar-btn-primary text-xs flex items-center gap-1 py-1.5 px-3"
            >
              <Plus size={12} />
              Add
            </button>
          </div>

          {/* Add Interaction Form */}
          {showAddInteraction && (
            <div className="rounded-xl p-3 mb-3 border border-[var(--border)]" style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="caesar-label text-xs">Date</label>
                  <input
                    className="caesar-input w-full text-sm"
                    type="date"
                    value={newInteraction.date}
                    onChange={(e) => setNewInteraction((i) => ({ ...i, date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="caesar-label text-xs">Type</label>
                  <select
                    className="caesar-input w-full text-sm"
                    value={newInteraction.type}
                    onChange={(e) => setNewInteraction((i) => ({ ...i, type: e.target.value }))}
                  >
                    {INTERACTION_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <textarea
                className="caesar-input w-full text-sm resize-none mb-2"
                rows={2}
                placeholder="Notes about this interaction..."
                value={newInteraction.notes}
                onChange={(e) => setNewInteraction((i) => ({ ...i, notes: e.target.value }))}
              />
              <div className="flex gap-2">
                <button onClick={handleAddInteraction} className="caesar-btn-primary text-xs py-1.5">
                  Save Interaction
                </button>
                <button onClick={() => setShowAddInteraction(false)} className="caesar-btn-ghost text-xs py-1.5">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Timeline */}
          {sortedInteractions.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
              No interactions logged yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
              {sortedInteractions.map((interaction) => (
                <div
                  key={interaction.id}
                  className="flex gap-3 p-2.5 rounded-lg transition-colors duration-300"
                  style={{ backgroundColor: 'var(--bg-elevated)' }}
                >
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--text-muted)' }} />
                    <div className="w-px flex-1 mt-1" style={{ backgroundColor: 'var(--bg-elevated)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{interaction.type}</span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {formatDate(interaction.date)}
                      </span>
                    </div>
                    {interaction.notes && (
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {interaction.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── QUICK LOG INTERACTION MODAL ──────────────────────────────────────────────

interface QuickLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  onLog: (contactId: string, interaction: ContactInteraction) => void;
}

function QuickLogModal({ isOpen, onClose, contact, onLog }: QuickLogModalProps) {
  const [form, setForm] = useState<Omit<ContactInteraction, 'id'>>(emptyInteraction());

  React.useEffect(() => {
    if (isOpen) setForm(emptyInteraction());
  }, [isOpen]);

  if (!contact) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLog(contact.id, { id: generateId(), ...form });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Log Interaction — ${contact.name}`} size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="caesar-label">Date</label>
            <input
              className="caesar-input w-full"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div>
            <label className="caesar-label">Type</label>
            <select
              className="caesar-input w-full"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              {INTERACTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="caesar-label">Notes</label>
          <textarea
            className="caesar-input w-full resize-none"
            rows={3}
            placeholder="What was discussed?"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="caesar-btn-ghost">Cancel</button>
          <button type="submit" className="caesar-btn-primary">Log Interaction</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function ContactsCRM({ contacts, setContacts }: Props) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState<ContactTag | ''>('');
  const [filterFollowUp, setFilterFollowUp] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Filtered contacts
  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const matchSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.company ?? '').toLowerCase().includes(search.toLowerCase());
      const matchTag = !filterTag || c.tags.includes(filterTag as ContactTag);
      const matchFollowUp = !filterFollowUp || c.followUpNeeded;
      return matchSearch && matchTag && matchFollowUp;
    });
  }, [contacts, search, filterTag, filterFollowUp]);

  // CRUD helpers
  const handleAdd = (data: ContactFormData) => {
    const newContact: Contact = {
      id: generateId(),
      ...data,
      interactions: [],
      linkedProjects: [],
    };
    setContacts((prev) => [newContact, ...(Array.isArray(prev) ? prev : [])]);
    setAddModalOpen(false);
    toast.success('Contact saved');
  };

  const handleEdit = (data: ContactFormData) => {
    if (!selectedContact) return;
    setContacts((prev) =>
      (Array.isArray(prev) ? prev : []).map((c) =>
        c.id === selectedContact.id ? { ...c, ...data } : c
      )
    );
    setEditModalOpen(false);
    setSelectedContact(null);
    toast.success('Contact updated');
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this contact?')) return;
    setContacts((prev) => (Array.isArray(prev) ? prev : []).filter((c) => c.id !== id));
    toast.success('Contact deleted');
  };

  const handleUpdateContact = (updated: Contact) => {
    setContacts((prev) =>
      (Array.isArray(prev) ? prev : []).map((c) => (c.id === updated.id ? updated : c))
    );
    setSelectedContact(updated);
  };

  const handleLogInteraction = (contactId: string, interaction: ContactInteraction) => {
    setContacts((prev) =>
      (Array.isArray(prev) ? prev : []).map((c) =>
        c.id === contactId
          ? {
              ...c,
              interactions: [interaction, ...c.interactions],
              lastContacted: interaction.date,
            }
          : c
      )
    );
    toast.success('Interaction logged');
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-imported if needed
    e.target.value = '';

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        if (!rows.length) { toast.error('CSV appears to be empty'); return; }

        const normalizeKey = (obj: Record<string, string>, ...keys: string[]) => {
          for (const k of keys) {
            const found = Object.keys(obj).find(ok => ok.trim().toLowerCase() === k.toLowerCase());
            if (found) return obj[found]?.trim() ?? '';
          }
          return '';
        };

        const today = todayStr();
        const existing = new Set(contacts.map(c => c.email?.toLowerCase()).filter(Boolean));
        let added = 0;
        let skipped = 0;

        const newContacts: Contact[] = [];
        for (const row of rows) {
          const name = normalizeKey(row, 'name', 'full name', 'fullname', 'contact name');
          if (!name) { skipped++; continue; }

          const email = normalizeKey(row, 'email', 'email address');
          if (email && existing.has(email.toLowerCase())) { skipped++; continue; }
          if (email) existing.add(email.toLowerCase());

          const rawTag = normalizeKey(row, 'tag', 'type', 'category', 'relationship type');
          const tag = (ALL_TAGS.includes(rawTag as ContactTag) ? rawTag : 'Other') as ContactTag;

          newContacts.push({
            id: generateId(),
            name,
            email: email || undefined,
            phone: normalizeKey(row, 'phone', 'phone number', 'mobile') || undefined,
            company: normalizeKey(row, 'company', 'organization', 'employer') || undefined,
            relationship: normalizeKey(row, 'relationship', 'role', 'title'),
            tags: [tag],
            lastContacted: today,
            followUpNeeded: false,
            notes: normalizeKey(row, 'notes', 'note', 'comments') || '',
            interactions: [],
            linkedProjects: [],
          });
          added++;
        }

        if (newContacts.length) {
          setContacts(prev => [...newContacts, ...(Array.isArray(prev) ? prev : [])]);
        }

        if (added > 0 && skipped > 0) {
          toast.success(`Imported ${added} contacts (${skipped} skipped — duplicates or missing name)`);
        } else if (added > 0) {
          toast.success(`Imported ${added} contact${added !== 1 ? 's' : ''}`);
        } else {
          toast.error(`No contacts imported — ${skipped} row${skipped !== 1 ? 's' : ''} skipped`);
        }
      },
      error: () => toast.error('Failed to parse CSV'),
    });
  };

  const openEdit = (contact: Contact) => {
    setSelectedContact(contact);
    setEditModalOpen(true);
  };

  const openDetail = (contact: Contact) => {
    setSelectedContact(contact);
    setDetailModalOpen(true);
  };

  const openLog = (contact: Contact) => {
    setSelectedContact(contact);
    setLogModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 transition-colors duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Contacts</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Manage your network and relationships
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCSVImport}
          />
          <button
            onClick={() => csvInputRef.current?.click()}
            className="caesar-btn-ghost flex items-center gap-2"
            title="Import contacts from a CSV file"
          >
            <Upload size={15} />
            Import CSV
          </button>
          <button
            onClick={() => setAddModalOpen(true)}
            className="caesar-btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            Add Contact
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <StatsRow contacts={contacts} />

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-52">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            className="caesar-input w-full pl-9"
            placeholder="Search by name or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Tag Filter */}
        <div className="relative">
          <button
            onClick={() => setShowTagDropdown((v) => !v)}
            className="caesar-btn-ghost flex items-center gap-2 min-w-36"
          >
            <Filter size={13} />
            {filterTag || 'All Tags'}
            <ChevronDown size={13} className={`ml-auto transition-transform ${showTagDropdown ? 'rotate-180' : ''}`} />
          </button>
          {showTagDropdown && (
            <div
              className="absolute top-full mt-1 left-0 z-20 rounded-xl border shadow-2xl overflow-hidden transition-colors duration-300"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                minWidth: 160,
              }}
            >
              <button
                onClick={() => { setFilterTag(''); setShowTagDropdown(false); }}
                className="w-full text-left px-3 py-2 text-sm transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                All Tags
              </button>
              {ALL_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => { setFilterTag(tag); setShowTagDropdown(false); }}
                  className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2"
                  style={{ color: TAG_COLORS[tag] }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: TAG_COLORS[tag] }}
                  />
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Follow Up Toggle */}
        <button
          onClick={() => setFilterFollowUp((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
            filterFollowUp
              ? 'text-[var(--text-secondary)] border border-red-400/40 bg-red-400/10'
              : 'caesar-btn-ghost'
          }`}
        >
          <Calendar size={13} />
          Follow Up
        </button>
      </div>

      {/* Results count */}
      {(search || filterTag || filterFollowUp) && (
        <p className="text-xs -mt-2" style={{ color: 'var(--text-muted)' }}>
          Showing {filtered.length} of {contacts.length} contacts
        </p>
      )}

      {/* Contact Grid */}
      {filtered.length === 0 ? (
        <div className="caesar-card flex flex-col items-center justify-center py-16 text-center">
          <User size={40} className="mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            {contacts.length === 0 ? 'No contacts yet' : 'No contacts match your filters'}
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {contacts.length === 0
              ? 'Click "Add Contact" to start building your network'
              : 'Try adjusting your search or filters'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onEdit={() => openEdit(contact)}
              onDelete={() => handleDelete(contact.id)}
              onDetail={() => openDetail(contact)}
              onLogInteraction={() => openLog(contact)}
            />
          ))}
        </div>
      )}

      {/* Add Contact Modal */}
      <ContactFormModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSave={handleAdd}
        title="Add New Contact"
      />

      {/* Edit Contact Modal */}
      {selectedContact && (
        <ContactFormModal
          isOpen={editModalOpen}
          onClose={() => { setEditModalOpen(false); setSelectedContact(null); }}
          onSave={handleEdit}
          initial={{
            name: selectedContact.name,
            email: selectedContact.email ?? '',
            phone: selectedContact.phone ?? '',
            company: selectedContact.company ?? '',
            address: selectedContact.address ?? '',
            mapLat: selectedContact.mapLat,
            mapLng: selectedContact.mapLng,
            mapLabel: selectedContact.mapLabel,
            relationship: selectedContact.relationship,
            tags: selectedContact.tags,
            lastContacted: selectedContact.lastContacted,
            followUpDate: selectedContact.followUpDate ?? '',
            followUpNeeded: selectedContact.followUpNeeded,
            birthday: selectedContact.birthday ?? '',
            anniversary: selectedContact.anniversary ?? '',
            notes: selectedContact.notes,
          }}
          title={`Edit — ${selectedContact.name}`}
        />
      )}

      {/* Contact Detail Modal */}
      <ContactDetailModal
        isOpen={detailModalOpen}
        onClose={() => { setDetailModalOpen(false); setSelectedContact(null); }}
        contact={selectedContact}
        onUpdate={handleUpdateContact}
      />

      {/* Quick Log Modal */}
      <QuickLogModal
        isOpen={logModalOpen}
        onClose={() => { setLogModalOpen(false); setSelectedContact(null); }}
        contact={selectedContact}
        onLog={handleLogInteraction}
      />
    </div>
  );
}
