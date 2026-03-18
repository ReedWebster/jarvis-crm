import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  Calendar,
  Mail,
  Inbox,
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
  ChevronLeft,
  ChevronRight,
  Upload,
  Layers,
  Shuffle,
  LayoutGrid,
  CreditCard,
  Linkedin,
  MapPin,
  X,
  Tag,
  Pencil,
  Check,
  Sparkles,
} from 'lucide-react';
import Papa from 'papaparse';
import { format, parseISO, differenceInDays, isWithinInterval, addDays } from 'date-fns';
import type { Contact, ContactTag, ContactInteraction, Project } from '../../types';
import { generateId, todayStr, calcRelationshipHealth, getHealthColor, formatDate } from '../../utils';
import { useToast } from '../shared/Toast';
import { Modal } from '../shared/Modal';
import { Badge } from '../shared/Badge';
import { EmailComposeModal } from '../email/EmailComposeModal';
import { EmailThread } from '../email/EmailThread';
import { PhoneLink } from '../shared/PhoneLink';
import { useGoogleContacts } from '../../hooks/useGoogleContacts';
import { deleteContactCalendarEvents } from '../../hooks/useGoogleCalendar';
import OutreachCoach from '../outreach/OutreachCoach';

// ─── TAG COLORS ───────────────────────────────────────────────────────────────

type TagDef = { name: string; color: string; parent?: string };

const TAG_PALETTE_FALLBACK = [
  '#60a5fa','#34d399','#f472b6','#fb923c','#a78bfa',
  '#facc15','#38bdf8','#4ade80','#f87171','#e879f9',
];

/** Safely coerce a tag entry — handles old string[] data from Supabase */
function normalizeTag(t: unknown, i: number): TagDef {
  if (t && typeof t === 'object' && 'name' in t) return t as TagDef;
  return { name: String(t), color: TAG_PALETTE_FALLBACK[i % TAG_PALETTE_FALLBACK.length] };
}

function getTagColor(tagName: string, allTags: TagDef[]): string {
  return allTags.find(t => t.name === tagName)?.color ?? '#6b7280';
}

/** Returns tags in parent-first order with depth so UIs can indent sub-tags */
function buildTagHierarchy(tags: TagDef[]): Array<TagDef & { depth: number }> {
  const result: Array<TagDef & { depth: number }> = [];
  for (const t of tags.filter(t => !t.parent)) {
    result.push({ ...t, depth: 0 });
    for (const st of tags.filter(s => s.parent === t.name)) {
      result.push({ ...st, depth: 1 });
    }
  }
  // Orphaned sub-tags (parent was deleted) – show at top level
  for (const t of tags.filter(t => t.parent && !tags.find(p => p.name === t.parent))) {
    result.push({ ...t, depth: 0 });
  }
  return result;
}

const INTERACTION_TYPES = ['Call', 'Email', 'Meeting', 'Text', 'LinkedIn'];

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  contacts: Contact[];
  setContacts: (v: Contact[] | ((p: Contact[]) => Contact[])) => void;
  contactTags: TagDef[];
  setContactTags: (v: TagDef[] | ((p: TagDef[]) => TagDef[])) => void;
  projects?: Project[];
  onNavigateToNetworking?: () => void;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function capitalizeName(name: string): string {
  return name.trim().replace(/\b\w/g, c => c.toUpperCase());
}

// ─── EMPTY FORMS ─────────────────────────────────────────────────────────────

function emptyContact(): Omit<Contact, 'id' | 'interactions' | 'linkedProjects'> {
  return {
    name: '',
    email: '',
    phone: '',
    company: '',
    linkedin: '',
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="caesar-card flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className="flex items-center justify-center rounded-xl flex-shrink-0"
            style={{ width: 36, height: 36, backgroundColor: `${color}20` }}
          >
            <Icon size={16} style={{ color }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg sm:text-xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }} title={label}>{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── CONTACT CARD ─────────────────────────────────────────────────────────────

interface ContactCardProps {
  contact: Contact;
  contactTags: TagDef[];
  onEdit: () => void;
  onDelete: () => void;
  onDetail: () => void;
  onLogInteraction: () => void;
  onSendEmail?: () => void;
  onViewEmails?: () => void;
  onUpdateTags: (tags: ContactTag[]) => void;
  mergeMode?: boolean;
  isSelectedForMerge?: boolean;
  onToggleMerge?: () => void;
}

function ContactCard({ contact, contactTags, onEdit, onDelete, onDetail, onLogInteraction, onSendEmail, onViewEmails, onUpdateTags, mergeMode, isSelectedForMerge, onToggleMerge }: ContactCardProps) {
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
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
    <div
      className={`caesar-card group flex flex-col gap-3 transition-all duration-200 ${mergeMode ? 'cursor-pointer' : 'hover:border-blue-500/40'} ${isSelectedForMerge ? 'ring-2 ring-violet-500 border-violet-500/60' : ''}`}
      onClick={mergeMode ? onToggleMerge : undefined}
    >
      {/* Merge mode checkbox overlay */}
      {mergeMode && (
        <div className="flex items-center gap-2 pb-1 border-b" style={{ borderColor: 'var(--border)' }}>
          <div
            className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors ${isSelectedForMerge ? 'bg-violet-500' : 'border'}`}
            style={isSelectedForMerge ? {} : { borderColor: 'var(--border)' }}
          >
            {isSelectedForMerge && <Check size={10} className="text-white" />}
          </div>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {isSelectedForMerge ? 'Selected for merge' : 'Click to select'}
          </span>
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <button
            onClick={mergeMode ? undefined : onDetail}
            className="text-left text-base font-bold leading-tight truncate block w-full transition-colors duration-200"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            {capitalizeName(contact.name)}
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
        <div className="flex items-center gap-1.5">
          {contact.aiEnrichment && (
            <span title={`AI enriched · ${contact.aiEnrichment.relationshipTier}`}>
              <Sparkles size={12} style={{ color: '#a78bfa' }} />
            </span>
          )}
          <HealthCircle score={health} />
        </div>
      </div>

      {/* Contact info rows */}
      <div className="flex flex-col gap-1">
        {contact.email && (
          <div className="flex items-center gap-1.5">
            <Mail size={11} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{contact.email}</span>
          </div>
        )}
        {contact.phone && (
          <PhoneLink phone={contact.phone} className="flex items-center gap-1.5">
            <Phone size={11} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{contact.phone}</span>
          </PhoneLink>
        )}
        {(contact as any).linkedin && (
          <div className="flex items-center gap-1.5">
            <Linkedin size={11} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{(contact as any).linkedin}</span>
          </div>
        )}
        {(contact.mapLabel || contact.address) && (
          <div className="flex items-center gap-1.5">
            <MapPin size={11} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{contact.mapLabel || contact.address}</span>
          </div>
        )}
      </div>

      {/* Tags — inline editable */}
      <div className="flex flex-wrap gap-1 items-center relative">
        {contact.tags.map((tag) => (
          <button
            key={tag}
            onClick={(e) => { e.stopPropagation(); onUpdateTags(contact.tags.filter(t => t !== tag)); }}
            className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium transition-all"
            style={{
              backgroundColor: `${getTagColor(tag, contactTags)}22`,
              color: getTagColor(tag, contactTags),
              border: `1px solid ${getTagColor(tag, contactTags)}55`,
            }}
            title="Remove tag"
          >
            {tag}
            <X size={9} className="ml-0.5 opacity-60" />
          </button>
        ))}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setTagMenuOpen(o => !o); }}
            className="flex items-center justify-center rounded-full w-5 h-5 text-xs transition-colors"
            style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}
            title="Add tag"
          >
            +
          </button>
          {tagMenuOpen && (
            <div
              className="absolute left-0 top-6 z-50 rounded-lg shadow-xl p-2 flex flex-col gap-0.5 min-w-[130px]"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              onMouseLeave={() => setTagMenuOpen(false)}
            >
              {(() => {
                const available = buildTagHierarchy(contactTags).filter(t => !contact.tags.includes(t.name));
                if (available.length === 0) return <span className="text-xs px-2 py-1" style={{ color: 'var(--text-muted)' }}>All tags added</span>;
                return available.map(t => (
                  <button
                    key={t.name}
                    onClick={(e) => { e.stopPropagation(); onUpdateTags([...contact.tags, t.name]); setTagMenuOpen(false); }}
                    className="text-left text-xs py-1 rounded transition-colors hover:opacity-80"
                    style={{ color: t.color, paddingLeft: t.depth > 0 ? '20px' : '8px' }}
                  >
                    {t.depth > 0 ? `└ ${t.name}` : t.name}
                  </button>
                ));
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-2 flex-wrap">
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
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="caesar-btn-ghost flex-1 text-xs flex items-center justify-center gap-1 py-1.5"
            title={`Email ${contact.name}`}
          >
            <Mail size={11} />
            Email
          </a>
        )}
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
        {contact.email && (
          <>
            <button
              onClick={onSendEmail}
              title="Send Email"
              className="caesar-btn-ghost flex-1 text-xs flex items-center justify-center gap-1 py-1.5"
            >
              <Mail size={11} />
              Send
            </button>
            <button
              onClick={onViewEmails}
              title="View Email History"
              className="caesar-btn-ghost flex-1 text-xs flex items-center justify-center gap-1 py-1.5"
            >
              <Inbox size={11} />
              Inbox
            </button>
          </>
        )}
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

// ─── FLASHCARD VIEW ──────────────────────────────────────────────────────────

interface FlashcardViewProps {
  deck: Contact[];
  contactTags: TagDef[];
  setContacts: (v: Contact[] | ((p: Contact[]) => Contact[])) => void;
  shuffled: boolean;
  onShuffleToggle: () => void;
  onBackToGrid: () => void;
  onDelete: (id: string) => void;
  onEdit: (contact: Contact) => void;
  isModalOpen?: boolean;
}

function FlashcardView({
  deck,
  contactTags,
  setContacts,
  shuffled,
  onShuffleToggle,
  onBackToGrid,
  onDelete,
  onEdit,
  isModalOpen = false,
}: FlashcardViewProps) {
  const [index, setIndex] = useState(0);
  const [pendingTags, setPendingTags] = useState<ContactTag[]>([]);
  const [pendingFollowUp, setPendingFollowUp] = useState<boolean | null>(null);
  const touchStartX = useRef<number | null>(null);
  const contact = deck[index] ?? null;
  const total = deck.length;

  // Reset pending state when the card changes
  useEffect(() => {
    if (contact) {
      setPendingTags([...contact.tags]);
      setPendingFollowUp(contact.followUpNeeded ?? false);
    }
  }, [contact?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateContact = useCallback(
    (updated: Contact) => {
      setContacts((prev) =>
        (Array.isArray(prev) ? prev : []).map((c) => (c.id === updated.id ? updated : c))
      );
    },
    [setContacts]
  );

  const commitAndAdvance = useCallback(
    (direction: 'next' | 'prev') => {
      if (contact) {
        const followUp = pendingFollowUp ?? contact.followUpNeeded ?? false;
        updateContact({
          ...contact,
          tags: pendingTags,
          followUpNeeded: followUp,
          followUpDate: followUp ? contact.followUpDate || todayStr() : '',
        });
      }
      setIndex((i) =>
        direction === 'next'
          ? i >= total - 1 ? 0 : i + 1
          : i <= 0 ? total - 1 : i - 1
      );
    },
    [contact, pendingTags, pendingFollowUp, updateContact, total]
  );

  const goPrev = useCallback(() => commitAndAdvance('prev'), [commitAndAdvance]);
  const goNext = useCallback(() => commitAndAdvance('next'), [commitAndAdvance]);

  const togglePendingTag = useCallback((tag: ContactTag) => {
    setPendingTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const SWIPE_THRESHOLD = 50;
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current == null) return;
      const endX = e.changedTouches[0].clientX;
      const delta = endX - touchStartX.current;
      touchStartX.current = null;
      if (delta > SWIPE_THRESHOLD) goPrev();
      else if (delta < -SWIPE_THRESHOLD) goNext();
    },
    [goPrev, goNext]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isModalOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        (e.target as HTMLElement)?.isContentEditable;
      if (isEditable) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext, isModalOpen]);

  useEffect(() => {
    setIndex(0);
  }, [deck.length, shuffled]);

  if (total === 0) {
    return (
      <div className="caesar-card flex flex-col items-center justify-center py-20 text-center">
        <CreditCard size={48} className="mb-4" style={{ color: 'var(--text-muted)' }} />
        <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>
          All contacts have been tagged
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Flashcard view only shows contacts with no tags assigned.
        </p>
        <button onClick={onBackToGrid} className="caesar-btn-ghost mt-4">
          Back to grid
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onBackToGrid}
            className="caesar-btn-ghost flex items-center gap-2"
            title="Back to grid view"
          >
            <LayoutGrid size={16} />
            Grid
          </button>
          <button
            onClick={onShuffleToggle}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
              shuffled ? 'border-blue-500/50 bg-blue-500/10' : 'caesar-btn-ghost'
            }`}
            style={shuffled ? { color: 'var(--text-primary)' } : undefined}
            title="Shuffle deck"
          >
            <Shuffle size={14} />
            {shuffled ? 'Shuffled' : 'Shuffle'}
          </button>
          {contact && (
            <>
              <button
                onClick={() => onEdit(contact)}
                className="caesar-btn-ghost flex items-center gap-2"
                title="Edit contact"
              >
                <Edit3 size={14} />
                Edit
              </button>
              <button
                onClick={() => {
                  onDelete(contact.id);
                  // Adjust index if we deleted the last card
                  setIndex((i) => (i >= deck.length - 1 ? Math.max(0, deck.length - 2) : i));
                }}
                className="caesar-btn-ghost flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                title="Delete contact"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          <span>
            {index + 1} / {total}
          </span>
          <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${total ? (100 * (index + 1)) / total : 0}%`,
                backgroundColor: 'var(--text-muted)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Card — keyboard: ←/→/Space; touch: swipe left/right */}
      <div
        className="caesar-card flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 md:p-8 min-h-[280px] sm:min-h-[320px] select-none touch-pan-y overflow-x-hidden"
        style={{ borderColor: 'var(--border)' }}
        role="region"
        aria-label={`Contact ${index + 1} of ${total}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {contact && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {contact.name}
              </h2>
              {contact.company && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <Building size={14} />
                  {contact.company}
                </div>
              )}
              {contact.relationship && (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {contact.relationship}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <Clock size={12} />
                Last contact: {formatDate(contact.lastContacted)}
              </div>
              {pendingTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {pendingTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-md text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        color: getTagColor(tag, contactTags),
                        border: `1px solid ${getTagColor(tag, contactTags)}`,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Quick sort: set tags (multi-select — changes saved when you navigate) */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                Tags {pendingTags.length > 0 && <span className="normal-case ml-1 opacity-60">({pendingTags.length} selected)</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {contactTags.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => togglePendingTag(t.name)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all border"
                    style={{
                      borderColor: pendingTags.includes(t.name) ? t.color : 'var(--border)',
                      backgroundColor: pendingTags.includes(t.name) ? `${t.color}20` : 'transparent',
                      color: pendingTags.includes(t.name) ? t.color : 'var(--text-secondary)',
                    }}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Follow-up toggle */}
            <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Needs follow-up?
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPendingFollowUp(true)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pendingFollowUp === true ? 'ring-2 ring-amber-500/60' : ''
                  }`}
                  style={{
                    backgroundColor: pendingFollowUp === true ? 'rgba(245,158,11,0.2)' : 'var(--bg-elevated)',
                    color: pendingFollowUp === true ? '#f59e0b' : 'var(--text-muted)',
                  }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setPendingFollowUp(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pendingFollowUp === false ? 'ring-2 ring-emerald-500/40' : ''
                  }`}
                  style={{
                    backgroundColor: pendingFollowUp === false ? 'rgba(16,185,129,0.15)' : 'var(--bg-elevated)',
                    color: pendingFollowUp === false ? '#10b981' : 'var(--text-muted)',
                  }}
                >
                  No
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-center gap-3 sm:gap-4">
        <button
          onClick={goPrev}
          className="caesar-btn-ghost p-3 rounded-xl touch-target-min"
          title="Previous (←)"
          aria-label="Previous contact"
        >
          <ChevronLeft size={24} />
        </button>
        <button
          onClick={goNext}
          className="caesar-btn-primary flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold touch-target-min"
          title="Save & Next (→ or Space)"
          aria-label="Save tags and go to next contact"
        >
          {pendingTags.length > 0 ? 'Save & Next' : 'Skip'}
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

// ─── MERGE CONTACTS MODAL ─────────────────────────────────────────────────────

interface MergeContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactA: Contact;
  contactB: Contact;
  onMerge: (merged: Contact, deleteId: string) => void;
}

type MergeChoice<T> = 'a' | 'b' | T;

function MergeContactsModal({ isOpen, onClose, contactA, contactB, onMerge }: MergeContactsModalProps) {
  const fields: Array<{ key: keyof Contact; label: string }> = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'company', label: 'Company' },
    { key: 'relationship', label: 'Relationship' },
    { key: 'linkedin', label: 'LinkedIn' },
    { key: 'address', label: 'Address' },
    { key: 'birthday', label: 'Birthday' },
    { key: 'anniversary', label: 'Anniversary' },
    { key: 'followUpDate', label: 'Follow-up Date' },
    { key: 'notes', label: 'Notes' },
  ];

  // Default: prefer whichever side has a non-empty value (A wins ties)
  const defaultChoice = (key: keyof Contact): 'a' | 'b' => {
    const va = contactA[key];
    const vb = contactB[key];
    if (!va && vb) return 'b';
    return 'a';
  };

  const [choices, setChoices] = useState<Record<string, 'a' | 'b'>>(() =>
    Object.fromEntries(fields.map(f => [f.key, defaultChoice(f.key)]))
  );
  const [primaryId, setPrimaryId] = useState<'a' | 'b'>('a');

  const pick = (side: 'a' | 'b') => (key: keyof Contact) => {
    const v = side === 'a' ? contactA[key] : contactB[key];
    return typeof v === 'string' ? v : '';
  };

  const handleConfirm = () => {
    const a = contactA;
    const b = contactB;
    const get = (key: keyof Contact) => {
      const side = choices[key as string] ?? 'a';
      return side === 'a' ? a[key] : b[key];
    };

    // Merge tags (union, deduplicated)
    const mergedTags = Array.from(new Set([...a.tags, ...b.tags]));
    // Combine interactions, sorted newest-first
    const mergedInteractions = [...a.interactions, ...b.interactions].sort(
      (x, y) => (x.date < y.date ? 1 : -1)
    );
    // Combine linkedProjects (deduped)
    const mergedProjects = Array.from(new Set([...a.linkedProjects, ...b.linkedProjects]));

    const keepId = primaryId === 'a' ? a.id : b.id;
    const deleteId = primaryId === 'a' ? b.id : a.id;

    const merged: Contact = {
      id: keepId,
      name: (get('name') as string) || a.name,
      email: get('email') as string | undefined,
      phone: get('phone') as string | undefined,
      company: get('company') as string | undefined,
      address: get('address') as string | undefined,
      mapLat: primaryId === 'a' ? a.mapLat : b.mapLat,
      mapLng: primaryId === 'a' ? a.mapLng : b.mapLng,
      mapLabel: primaryId === 'a' ? a.mapLabel : b.mapLabel,
      metAt: a.metAt || b.metAt,
      linkedin: get('linkedin') as string | undefined,
      googleResourceName: a.googleResourceName || b.googleResourceName,
      relationship: (get('relationship') as string) || '',
      tags: mergedTags,
      lastContacted: a.lastContacted > b.lastContacted ? a.lastContacted : b.lastContacted,
      followUpDate: (get('followUpDate') as string | undefined) || undefined,
      followUpNeeded: a.followUpNeeded || b.followUpNeeded,
      birthday: get('birthday') as string | undefined,
      anniversary: get('anniversary') as string | undefined,
      notes: (get('notes') as string) || '',
      interactions: mergedInteractions,
      linkedProjects: mergedProjects,
      aiEnrichment: primaryId === 'a' ? a.aiEnrichment : b.aiEnrichment,
    };

    onMerge(merged, deleteId);
  };

  const renderValue = (contact: Contact, key: keyof Contact) => {
    const v = contact[key];
    if (v === undefined || v === null || v === '') return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>empty</span>;
    if (typeof v === 'boolean') return <span>{v ? 'Yes' : 'No'}</span>;
    return <span className="truncate">{String(v)}</span>;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Merge Contacts" size="lg">
      <div className="flex flex-col gap-5">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Choose which value to keep for each field. Tags and interactions are always combined. The primary contact's ID is preserved.
        </p>

        {/* Primary contact selector */}
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <span className="text-xs font-semibold uppercase tracking-wide flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Primary (keeps ID)</span>
          <div className="flex gap-2 flex-1">
            {(['a', 'b'] as const).map(side => (
              <button
                key={side}
                type="button"
                onClick={() => setPrimaryId(side)}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium transition-all border"
                style={{
                  borderColor: primaryId === side ? '#8b5cf6' : 'var(--border)',
                  backgroundColor: primaryId === side ? 'rgba(139,92,246,0.15)' : 'transparent',
                  color: primaryId === side ? '#a78bfa' : 'var(--text-secondary)',
                }}
              >
                {side === 'a' ? contactA.name : contactB.name}
              </button>
            ))}
          </div>
        </div>

        {/* Field-by-field comparison */}
        <div className="flex flex-col gap-2">
          {fields.map(({ key, label }) => {
            const va = contactA[key];
            const vb = contactB[key];
            const bothEmpty = (va === undefined || va === null || va === '') && (vb === undefined || vb === null || vb === '');
            if (bothEmpty) return null;
            const same = String(va ?? '') === String(vb ?? '');
            return (
              <div key={key} className="rounded-xl border p-3 flex flex-col gap-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</span>
                  {same && <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>identical</span>}
                </div>
                {same ? (
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{renderValue(contactA, key)}</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {(['a', 'b'] as const).map(side => {
                      const contact = side === 'a' ? contactA : contactB;
                      const selected = choices[key] === side;
                      return (
                        <button
                          key={side}
                          type="button"
                          onClick={() => setChoices(c => ({ ...c, [key]: side }))}
                          className="text-left p-2 rounded-lg border transition-all text-xs"
                          style={{
                            borderColor: selected ? '#8b5cf6' : 'var(--border)',
                            backgroundColor: selected ? 'rgba(139,92,246,0.12)' : 'var(--bg-elevated)',
                            color: selected ? '#c4b5fd' : 'var(--text-secondary)',
                          }}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <div
                              className={`w-3 h-3 rounded-full border flex-shrink-0 transition-colors`}
                              style={{ borderColor: selected ? '#8b5cf6' : 'var(--text-muted)', backgroundColor: selected ? '#8b5cf6' : 'transparent' }}
                            />
                            <span className="font-medium opacity-60">{side === 'a' ? contactA.name : contactB.name}</span>
                          </div>
                          <div className="truncate">{renderValue(contact, key)}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Tags — always combined, read-only preview */}
          <div className="rounded-xl border p-3 flex flex-col gap-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Tags (combined)</span>
            <div className="flex flex-wrap gap-1">
              {Array.from(new Set([...contactA.tags, ...contactB.tags])).map(tag => (
                <span key={tag} className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* Interactions — combined count */}
          <div className="rounded-xl border p-3 flex items-center justify-between" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Interactions (combined)</span>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{contactA.interactions.length + contactB.interactions.length} total</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="caesar-btn-ghost">Cancel</button>
          <button
            type="button"
            onClick={handleConfirm}
            className="caesar-btn-primary flex items-center gap-2"
            style={{ backgroundColor: '#7c3aed' }}
          >
            <Check size={14} />
            Merge Contacts
          </button>
        </div>
      </div>
    </Modal>
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
  linkedin: string;
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
  contactTags: TagDef[];
}

function ContactFormModal({ isOpen, onClose, onSave, initial, title, contactTags }: ContactFormModalProps) {
  const emptyForm = (): ContactFormData => ({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    company: initial?.company ?? '',
    linkedin: (initial as any)?.linkedin ?? '',
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="caesar-label">LinkedIn</label>
            <input
              className="caesar-input w-full"
              placeholder="linkedin.com/in/username"
              value={form.linkedin}
              onChange={(e) => setForm((f) => ({ ...f, linkedin: e.target.value }))}
            />
          </div>
          <div>
            <label className="caesar-label">Address</label>
            <AddressAutocomplete
              value={form.address}
              onChange={(address, lat, lng, label) =>
                setForm((f) => ({ ...f, address, mapLat: lat, mapLng: lng, mapLabel: label }))
              }
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

        {/* ── Relationship ── */}
        <div className="flex items-center gap-3 mt-1">
          <p className="caesar-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Relationship</p>
          <hr className="caesar-divider flex-1" />
        </div>
        <div>
          <label className="caesar-label">Tags</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {buildTagHierarchy(contactTags).map((t) => {
              const selected = form.tags.includes(t.name);
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => toggleTag(t.name)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150"
                  style={{
                    backgroundColor: selected ? `${t.color}30` : 'var(--bg-elevated)',
                    color: selected ? t.color : 'var(--text-muted)',
                    border: `1px solid ${selected ? t.color + '60' : 'var(--border)'}`,
                    marginLeft: t.depth > 0 ? '8px' : '0',
                  }}
                >
                  {t.depth > 0 ? `└ ${t.name}` : t.name}
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
            <label className="caesar-label">Birthday</label>
            <input
              className="caesar-input w-full"
              type="date"
              value={form.birthday}
              onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))}
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
  contactTags: TagDef[];
  setContactTags?: (v: TagDef[] | ((p: TagDef[]) => TagDef[])) => void;
  projects?: Project[];
  onUpdate: (updated: Contact) => void;
  onSendEmail?: () => void;
  onViewEmails?: () => void;
  onEnrich?: (contact: Contact) => void;
  enriching?: boolean;
}

function ContactDetailModal({ isOpen, onClose, contact, contactTags, setContactTags, projects = [], onUpdate, onSendEmail, onViewEmails, onEnrich, enriching }: ContactDetailModalProps) {
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
    <Modal isOpen={isOpen} onClose={onClose} title={capitalizeName(contact.name)} size="xl">
      <div className="flex flex-col gap-5">
        {/* Info grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            {contact.email && (
              <div className="flex items-center gap-2 flex-wrap">
                <Mail size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{contact.email}</span>
                <button onClick={onSendEmail} className="caesar-btn-ghost text-xs flex items-center gap-1 py-1 px-2" title="Send Email">
                  <Mail size={11} /> Send
                </button>
                <button onClick={onViewEmails} className="caesar-btn-ghost text-xs flex items-center gap-1 py-1 px-2" title="View Email History">
                  <Inbox size={11} /> Inbox
                </button>
              </div>
            )}
            {contact.phone && (
              <PhoneLink phone={contact.phone} className="flex items-center gap-2">
                <Phone size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{contact.phone}</span>
              </PhoneLink>
            )}
            {(contact as any).linkedin && (
              <div className="flex items-center gap-2">
                <Linkedin size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <a
                  href={(contact as any).linkedin.startsWith('http') ? (contact as any).linkedin : `https://${(contact as any).linkedin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm truncate"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {(contact as any).linkedin}
                </a>
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
            {(contact.address || contact.mapLabel) && (
              <div className="flex items-start gap-2">
                <MapPin size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{contact.address || contact.mapLabel}</span>
              </div>
            )}
            {contact.birthday && (
              <div className="flex items-center gap-2">
                <Star size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Birthday: {formatDate(contact.birthday)}
                </span>
              </div>
            )}
            {contact.followUpDate && (
              <div className="flex items-center gap-2">
                <Calendar
                  size={14}
                  className="flex-shrink-0"
                  style={{ color: contact.followUpNeeded ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Follow up: {formatDate(contact.followUpDate)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* AI Enrich Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onEnrich?.(contact)}
            disabled={enriching}
            className="caesar-btn-ghost flex items-center gap-2 text-sm"
          >
            <Sparkles size={14} className={enriching ? 'animate-spin' : ''} />
            {enriching ? 'Enriching…' : contact.aiEnrichment ? 'Re-enrich' : 'Enrich with AI'}
          </button>
          {contact.aiEnrichment?.enrichedAt && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Enriched {formatDate(contact.aiEnrichment.enrichedAt)}
            </span>
          )}
        </div>

        {/* AI Insights */}
        {contact.aiEnrichment && (
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} style={{ color: '#a78bfa' }} />
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                AI Insights
              </p>
              <span
                className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: '#a78bfa22', color: '#a78bfa', border: '1px solid #a78bfa44' }}
              >
                {contact.aiEnrichment.relationshipTier}
              </span>
            </div>

            {/* Summary */}
            <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
              {contact.aiEnrichment.summary}
            </p>

            {/* Strategic Notes */}
            <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Strategy</p>
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              {contact.aiEnrichment.strategicNotes}
            </p>

            {/* Follow-up Timing */}
            <div className="flex items-center gap-2 mb-3">
              <Clock size={12} style={{ color: 'var(--text-muted)' }} />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Recommended: {contact.aiEnrichment.followUpTiming}
              </span>
            </div>

            {/* Talking Points */}
            {contact.aiEnrichment.talkingPoints.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Next Conversation</p>
                <ul className="flex flex-col gap-1">
                  {contact.aiEnrichment.talkingPoints.map((tp, i) => (
                    <li key={i} className="text-xs flex items-start gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <span className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }}>—</span>
                      {tp}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggested Tags — accept to add */}
            {(() => {
              const newSuggested = contact.aiEnrichment!.suggestedTags.filter(t => !contact.tags.includes(t));
              if (newSuggested.length === 0) return null;
              return (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-muted)' }}>Suggested Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {newSuggested.map(tag => (
                      <button
                        key={tag}
                        onClick={() => {
                          // Auto-create TagDef if new
                          if (setContactTags && !contactTags.find(t => t.name === tag)) {
                            const color = TAG_PALETTE_FALLBACK[contactTags.length % TAG_PALETTE_FALLBACK.length];
                            setContactTags(prev => [...prev, { name: tag, color }]);
                          }
                          onUpdate({ ...contact, tags: [...contact.tags, tag] });
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                        style={{ backgroundColor: '#a78bfa15', color: '#a78bfa', border: '1px dashed #a78bfa55' }}
                      >
                        <Plus size={10} /> {tag}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Tags — inline add / remove */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {contactTags.map((t) => {
              const active = contact.tags.includes(t.name);
              return (
                <button
                  key={t.name}
                  onClick={() => {
                    const newTags = active
                      ? contact.tags.filter(n => n !== t.name)
                      : [...contact.tags, t.name];
                    onUpdate({ ...contact, tags: newTags });
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150"
                  style={{
                    backgroundColor: active ? `${t.color}25` : 'var(--bg-elevated)',
                    color: active ? t.color : 'var(--text-muted)',
                    border: `1px solid ${active ? t.color + '55' : 'var(--border)'}`,
                  }}
                >
                  {active ? <X size={10} /> : <Plus size={10} />}
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>

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

        {/* Linked Projects */}
        {projects.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Projects</p>
            <div className="flex flex-wrap gap-1.5">
              {contact.linkedProjects.map((projId) => {
                const proj = projects.find(p => p.id === projId);
                if (!proj) return null;
                return (
                  <span
                    key={projId}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    {proj.name}
                    <button
                      onClick={() => onUpdate({ ...contact, linkedProjects: contact.linkedProjects.filter(id => id !== projId) })}
                      title="Unlink project"
                    >
                      <X size={10} style={{ color: 'var(--text-muted)' }} />
                    </button>
                  </span>
                );
              })}
              {/* Add project dropdown */}
              {projects.filter(p => !contact.linkedProjects.includes(p.id)).length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    onUpdate({ ...contact, linkedProjects: [...contact.linkedProjects, e.target.value] });
                    e.target.value = '';
                  }}
                  className="px-2 py-1 rounded-lg text-xs cursor-pointer"
                  style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}
                >
                  <option value="">+ Add project…</option>
                  {projects.filter(p => !contact.linkedProjects.includes(p.id)).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
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

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function ContactsCRM({ contacts, setContacts, contactTags, setContactTags, projects = [], onNavigateToNetworking }: Props) {
  const toast = useToast();
  const { syncContacts, autoSync, deleteContact: deleteGoogleContact } = useGoogleContacts();
  const [isSyncing, setIsSyncing] = useState(false);
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<{ original: string; value: string; color: string; parent?: string } | null>(null);
  const [newTagValue, setNewTagValue] = useState('');
  const [newTagColor, setNewTagColor] = useState('#60a5fa');
  const [newTagParent, setNewTagParent] = useState('');

  // Migrate old string[] tag format → TagDef[] on first load
  useEffect(() => {
    if (!contactTags.length) return;
    if (typeof (contactTags[0] as unknown) === 'string') {
      const palette = [
        '#60a5fa','#34d399','#f472b6','#fb923c','#a78bfa',
        '#facc15','#38bdf8','#4ade80','#f87171','#e879f9',
        '#fbbf24','#2dd4bf','#818cf8','#fb7185','#a3e635',
      ];
      setContactTags(
        (contactTags as unknown as string[]).map((name, i) => ({
          name,
          color: palette[i % palette.length],
        }))
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-time dedup of existing contacts on mount
  useEffect(() => {
    if (!contacts.length) return;
    const seenEmails = new Set<string>();
    const seenNames  = new Set<string>();
    const deduped = contacts.filter(c => {
      const emailKey = c.email?.trim().toLowerCase();
      const nameKey  = c.name.trim().toLowerCase();
      if (emailKey) {
        if (seenEmails.has(emailKey)) return false;
        seenEmails.add(emailKey);
      } else {
        if (seenNames.has(nameKey)) return false;
      }
      seenNames.add(nameKey);
      return true;
    });
    if (deduped.length < contacts.length) {
      setContacts(deduped);
      toast.success(`Removed ${contacts.length - deduped.length} duplicate contact${contacts.length - deduped.length !== 1 ? 's' : ''}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync Google Contacts on page load (silent, incremental)
  useEffect(() => {
    autoSync().then(fetched => {
      if (fetched && fetched.length > 0) finalizeImport(fetched, 0);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState<ContactTag | ''>('');
  const [filterFollowUp, setFilterFollowUp] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [groupBy, setGroupBy] = useState<'none' | 'tag' | 'company'>('none');
  const [viewMode, setViewMode] = useState<'grid' | 'flashcard' | 'outreach'>('grid');
  const [flashcardShuffled, setFlashcardShuffled] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [threadModalOpen, setThreadModalOpen] = useState(false);

  // Merge mode
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([]);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);

  const toggleMergeSelect = (id: string) => {
    setMergeSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return prev; // cap at 2
      return [...prev, id];
    });
  };

  const exitMergeMode = () => {
    setMergeMode(false);
    setMergeSelectedIds([]);
  };

  const handleMerge = (merged: Contact, deleteId: string) => {
    setContacts(prev =>
      prev
        .filter(c => c.id !== deleteId)
        .map(c => c.id === merged.id ? merged : c)
    );
    setMergeModalOpen(false);
    exitMergeMode();
    toast.success('Contacts merged');
  };

  const mergeContactA = contacts.find(c => c.id === mergeSelectedIds[0]) ?? null;
  const mergeContactB = contacts.find(c => c.id === mergeSelectedIds[1]) ?? null;

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Filtered contacts
  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const matchSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.company ?? '').toLowerCase().includes(search.toLowerCase());
      const matchTag = !filterTag || c.tags.some(tag => {
        if (tag === filterTag) return true;
        // Also match contacts whose tag is a sub-tag of the selected parent
        const def = contactTags.find(td => td.name === tag);
        return def?.parent === filterTag;
      });
      const matchFollowUp = !filterFollowUp || c.followUpNeeded;
      return matchSearch && matchTag && matchFollowUp;
    });
  }, [contacts, search, filterTag, filterFollowUp]);

  // Flashcard deck: filtered list, optionally shuffled
  const untagged = useMemo(() => contacts.filter(c => c.tags.length === 0), [contacts]);
  const flashcardDeck = useMemo(() => {
    if (flashcardShuffled) return shuffleArray([...untagged]);
    const today = todayStr();
    return [...untagged].sort((a, b) => {
      const priority = (c: Contact): number => {
        if (c.followUpNeeded) {
          if (c.followUpDate && c.followUpDate < today) return 0; // overdue
          if (c.followUpDate === today) return 1;                  // due today
          return 2;                                                // needs follow-up
        }
        // Stale relationships next — lowest health (most at-risk) first
        return 3 + calcRelationshipHealth(c.lastContacted);
      };
      return priority(a) - priority(b);
    });
  }, [untagged, flashcardShuffled]);

  // CRUD helpers
  const handleAdd = (data: ContactFormData) => {
    const normalized = { ...data, name: capitalizeName(data.name) };
    const emailKey = normalized.email?.trim().toLowerCase();
    const nameKey  = normalized.name.trim().toLowerCase();
    const duplicate = contacts.find(c =>
      (emailKey && c.email?.trim().toLowerCase() === emailKey) ||
      c.name.trim().toLowerCase() === nameKey
    );
    if (duplicate) {
      toast.error(`"${duplicate.name}" already exists in your contacts`);
      return;
    }
    const newContact: Contact = {
      id: generateId(),
      ...normalized,
      interactions: [],
      linkedProjects: [],
    };
    setContacts((prev) => [newContact, ...(Array.isArray(prev) ? prev : [])]);
    setAddModalOpen(false);
    toast.success('Contact saved');
  };

  const handleEdit = (data: ContactFormData) => {
    if (!selectedContact) return;
    const normalized = { ...data, name: capitalizeName(data.name) };
    setContacts((prev) =>
      (Array.isArray(prev) ? prev : []).map((c) =>
        c.id === selectedContact.id ? { ...c, ...normalized } : c
      )
    );
    setEditModalOpen(false);
    setSelectedContact(null);
    toast.success('Contact updated');
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this contact?')) return;
    const contact = contacts.find(c => c.id === id);
    setContacts((prev) => (Array.isArray(prev) ? prev : []).filter((c) => c.id !== id));
    toast.success('Contact deleted');

    if (contact) {
      // Propagate deletion to Google Contacts (→ phone) and Google Calendar in the background
      if (contact.googleResourceName) {
        deleteGoogleContact(contact.googleResourceName).catch(() => {});
      }
      deleteContactCalendarEvents(contact.name).catch(() => {});
    }
  };

  const handleUpdateContact = (updated: Contact) => {
    setContacts((prev) =>
      (Array.isArray(prev) ? prev : []).map((c) => (c.id === updated.id ? updated : c))
    );
    setSelectedContact(updated);
  };

  // ── AI Enrichment ─────────────────────────────────────────────────────────
  const [enriching, setEnriching] = useState<Set<string>>(new Set());
  const [bulkEnriching, setBulkEnriching] = useState(false);

  const enrichContacts = useCallback(async (targetContacts: Contact[]) => {
    const batch = targetContacts.slice(0, 10);
    const ids = new Set(batch.map(c => c.id));
    setEnriching(prev => new Set([...prev, ...ids]));

    try {
      const res = await fetch('/api/enrich-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: batch,
          existingTags: contactTags.map(t => t.name),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Enrichment failed');
      }
      const { enrichments } = await res.json();

      setContacts(prev => prev.map(c => {
        const enrichment = enrichments.find((e: any) => e.contactId === c.id);
        if (!enrichment) return c;
        const { contactId: _, ...enrichData } = enrichment;
        const enriched = {
          ...c,
          aiEnrichment: { ...enrichData, enrichedAt: new Date().toISOString() },
        };
        // Keep selectedContact in sync if detail modal is showing this contact
        if (selectedContact?.id === c.id) setSelectedContact(enriched);
        return enriched;
      }));
      toast.success(`Enriched ${enrichments.length} contact${enrichments.length !== 1 ? 's' : ''}`);
    } catch (err: any) {
      toast.error(err.message || 'Enrichment failed');
    } finally {
      setEnriching(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [contactTags, setContacts, selectedContact, toast]);

  const handleBulkEnrich = useCallback(async () => {
    setBulkEnriching(true);
    const unenriched = contacts.filter(c => !c.aiEnrichment);
    const target = unenriched.length > 0 ? unenriched : contacts;
    for (let i = 0; i < target.length; i += 10) {
      await enrichContacts(target.slice(i, i + 10));
    }
    setBulkEnriching(false);
  }, [contacts, enrichContacts]);

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

  // ── Auto-tag inference from job title + company text ────────────────────
  const inferTag = (title: string, company: string): ContactTag => {
    const t = `${title} ${company}`.toLowerCase();
    if (/\b(professor|prof\b|ph\.?d|phd|faculty|lecturer|academic|researcher|postdoc)\b/.test(t)) return 'Professor';
    if (/\b(investor|vc\b|venture|angel\b|fund\b|capital|general partner|managing partner|limited partner)\b/.test(t)) return 'Investor';
    if (/\b(mentor|advisor|board member|counsel|coach|executive coach)\b/.test(t)) return 'Mentor';
    if (/\b(co-?founder|cofounder|founding partner)\b/.test(t)) return 'Partner';
    if (/\b(recruit|recruiter|talent|hiring|hr\b|human resources|headhunter)\b/.test(t)) return 'Recruit';
    if (/\b(client|customer|account)\b/.test(t)) return 'Client';
    if (/\b(colleague|coworker|co-?worker|teammate|staff|associate)\b/.test(t)) return 'Colleague';
    if (/\b(resident|tenant|renter|lessee)\b/.test(t)) return 'Resident';
    return 'Other';
  };

  // ── vCard parser (Apple Contacts .vcf export) ────────────────────────────
  const parseVCardText = (text: string): Contact[] => {
    const today = todayStr();
    const parsed: Contact[] = [];

    // Split on BEGIN:VCARD boundaries; each slice after index 0 is one card
    const cards = text.split(/BEGIN:VCARD/i).slice(1);

    for (const card of cards) {
      // Unfold folded lines (RFC 6350 §3.2 — continuation line starts with space/tab)
      const unfolded = card.replace(/\r?\n[ \t]/g, '');
      const lines = unfolded.split(/\r?\n/).filter(l => l && !/^END:VCARD/i.test(l));

      // Pull the first value for a given property name (e.g. "FN", "EMAIL")
      const get = (prop: string): string => {
        const re = new RegExp(`^${prop}(?:;[^:]*)?:(.*)`, 'i');
        for (const l of lines) {
          const m = l.match(re);
          if (m) return m[1].trim();
        }
        return '';
      };

      const name = get('FN');
      if (!name) continue;

      // First EMAIL line
      let email = '';
      for (const l of lines) {
        const m = l.match(/^EMAIL(?:;[^:]*)?:(.*)/i);
        if (m) { email = m[1].trim(); break; }
      }

      // First TEL line
      let phone = '';
      for (const l of lines) {
        const m = l.match(/^TEL(?:;[^:]*)?:(.*)/i);
        if (m) { phone = m[1].trim(); break; }
      }

      // ORG can be "Company;Department" — take the first segment
      const company = get('ORG').split(';')[0].trim();
      const title = get('TITLE');

      // NOTE may contain escaped newlines
      const notes = get('NOTE').replace(/\\n/g, '\n').replace(/\\,/g, ',');

      // BDAY: normalize 19900115 → 1990-01-15, drop --MMDD (no-year) values
      let birthday: string | undefined;
      const braw = get('BDAY');
      if (braw && !braw.startsWith('--')) {
        const clean = braw.replace(/\D/g, '');
        if (clean.length === 8) {
          birthday = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
        } else if (braw.match(/^\d{4}-\d{2}-\d{2}$/)) {
          birthday = braw;
        }
      }

      parsed.push({
        id: generateId(),
        name,
        email: email || undefined,
        phone: phone || undefined,
        company: company || undefined,
        relationship: title,
        tags: [inferTag(title, company)],
        lastContacted: today,
        followUpNeeded: false,
        birthday,
        notes,
        interactions: [],
        linkedProjects: [],
      });
    }

    return parsed;
  };

  // ── Shared import finalizer ───────────────────────────────────────────────
  const finalizeImport = (newContacts: Contact[], totalSkipped: number) => {
    const existingEmails = new Set(contacts.map(c => c.email?.trim().toLowerCase()).filter(Boolean));
    const existingNames  = new Set(contacts.map(c => c.name.trim().toLowerCase()));
    const deduped = newContacts.filter(c => {
      const emailKey = c.email?.trim().toLowerCase();
      const nameKey  = c.name.trim().toLowerCase();
      if (emailKey) {
        if (existingEmails.has(emailKey)) return false;
        existingEmails.add(emailKey);
      } else {
        if (existingNames.has(nameKey)) return false;
      }
      existingNames.add(nameKey);
      return true;
    });
    const skipped = totalSkipped + (newContacts.length - deduped.length);
    const added = deduped.length;

    if (added > 0) setContacts(prev => [...deduped, ...(Array.isArray(prev) ? prev : [])]);

    if (added > 0 && skipped > 0) {
      toast.success(`Imported ${added} contacts (${skipped} skipped — duplicates or missing name)`);
    } else if (added > 0) {
      toast.success(`Imported ${added} contact${added !== 1 ? 's' : ''}`);
    } else {
      toast.error(`No contacts imported — ${skipped} skipped`);
    }
  };

  const handleContactImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'vcf' || ext === 'vcard') {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        let text = ev.target?.result as string;
        if (!text) { toast.error('Could not read .vcf file'); return; }

        // Strip embedded base64 blobs (PHOTO, LOGO, SOUND, KEY) that can make
        // Apple Contacts exports enormous and crash the parser.
        // These fields span multiple folded lines — remove them all at once.
        text = text.replace(/^(PHOTO|LOGO|SOUND|KEY)[^\r\n]*(\r?\n[ \t][^\r\n]*)*/gim, '');

        // Split into individual vCards
        const cards = text.split(/BEGIN:VCARD/i).slice(1);
        if (!cards.length) { toast.error('No contacts found in this .vcf file'); return; }

        // Process in batches of 200 so the UI stays responsive on large exports
        const BATCH = 200;
        const all: Contact[] = [];
        for (let i = 0; i < cards.length; i += BATCH) {
          const chunk = cards.slice(i, i + BATCH);
          const parsed = parseVCardText('BEGIN:VCARD' + chunk.join('BEGIN:VCARD'));
          all.push(...parsed);
          // Yield to the browser between batches
          await new Promise(r => setTimeout(r, 0));
        }

        if (!all.length) { toast.error('No contacts found in this .vcf file'); return; }
        finalizeImport(all, 0);
      };
      reader.readAsText(file, 'utf-8');
      return;
    }

    // Default: CSV
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
        let skipped = 0;
        const newContacts: Contact[] = [];

        for (const row of rows) {
          const name = normalizeKey(row, 'name', 'full name', 'fullname', 'contact name');
          if (!name) { skipped++; continue; }

          const email = normalizeKey(row, 'email', 'email address');
          const rawTag = normalizeKey(row, 'tag', 'type', 'category', 'relationship type');
          const tag = (contactTags.some(t => t.name === rawTag) ? rawTag : 'Other') as ContactTag;

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
        }

        finalizeImport(newContacts, skipped);
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

  const openCompose = (contact: Contact) => {
    setSelectedContact(contact);
    setComposeModalOpen(true);
  };

  const openThread = (contact: Contact) => {
    setSelectedContact(contact);
    setThreadModalOpen(true);
  };

  const handleGoogleContactsSync = async () => {
    setIsSyncing(true);
    try {
      const fetched = await syncContacts();
      finalizeImport(fetched, 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (!msg.includes('popup_closed') && !msg.includes('access_denied')) {
        toast.error(`Google Contacts sync failed: ${msg}`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 transition-colors duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="section-title">Contacts</h1>
          <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
            Manage your network and relationships
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,.vcf,.vcard"
            className="hidden"
            onChange={handleContactImport}
          />
          <button
            onClick={handleGoogleContactsSync}
            disabled={isSyncing}
            className="caesar-btn-ghost flex items-center gap-2"
            title="Sync contacts from Google Contacts"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {isSyncing ? 'Syncing…' : 'Sync Google'}
          </button>
          <button
            onClick={() => csvInputRef.current?.click()}
            className="caesar-btn-ghost flex items-center gap-2"
            title="Import contacts from Apple Contacts (.vcf) or a CSV file"
          >
            <Upload size={15} />
            Import
          </button>
          {onNavigateToNetworking && (
            <button
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set('sortPanel', 'true');
                window.history.replaceState({}, '', url.toString());
                onNavigateToNetworking();
              }}
              className="caesar-btn flex items-center gap-2"
              title="Open contact sort panel in the city view"
            >
              Sort into City
            </button>
          )}
          <button
            onClick={handleBulkEnrich}
            disabled={bulkEnriching}
            className="caesar-btn flex items-center gap-2"
            title="Enrich all contacts with AI-generated profiles and insights"
          >
            <Sparkles size={15} className={bulkEnriching ? 'animate-spin' : ''} />
            {bulkEnriching ? 'Enriching…' : 'Enrich All'}
          </button>
          <button
            onClick={() => setManageTagsOpen(true)}
            className="caesar-btn flex items-center gap-2"
          >
            <Tag size={16} />
            Manage Tags
          </button>
          <button
            onClick={() => {
              if (mergeMode) {
                exitMergeMode();
              } else {
                setMergeMode(true);
                setViewMode('grid');
              }
            }}
            className={`caesar-btn flex items-center gap-2 ${mergeMode ? 'ring-2 ring-violet-500' : ''}`}
            style={mergeMode ? { backgroundColor: 'rgba(139,92,246,0.15)', color: '#a78bfa' } : {}}
            title="Select two contacts to merge them"
          >
            <Shuffle size={15} />
            {mergeMode ? 'Cancel Merge' : 'Merge'}
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
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-0 w-full sm:min-w-[200px] sm:w-auto">
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
              {buildTagHierarchy(contactTags).map((t) => (
                <button
                  key={t.name}
                  onClick={() => { setFilterTag(t.name); setShowTagDropdown(false); }}
                  className="w-full text-left py-2 text-sm transition-colors flex items-center gap-2"
                  style={{ color: t.color, paddingLeft: t.depth > 0 ? '28px' : '12px', paddingRight: '12px' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <span
                    className="rounded-full flex-shrink-0"
                    style={{ backgroundColor: t.color, width: t.depth > 0 ? '6px' : '8px', height: t.depth > 0 ? '6px' : '8px' }}
                  />
                  {t.depth > 0 ? `└ ${t.name}` : t.name}
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

        {/* Group By */}
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-colors duration-150"
          style={{ backgroundColor: groupBy !== 'none' ? 'var(--bg-elevated)' : 'transparent', borderColor: groupBy !== 'none' ? 'var(--border-strong)' : 'var(--border)', color: groupBy !== 'none' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          <Layers size={13} />
          <select
            value={groupBy}
            onChange={e => setGroupBy(e.target.value as typeof groupBy)}
            className="bg-transparent outline-none text-sm cursor-pointer"
            style={{ color: 'inherit' }}
          >
            <option value="none">No Grouping</option>
            <option value="tag">By Tag</option>
            <option value="company">By Company</option>
          </select>
        </div>

        {/* View: Grid | Flashcard */}
        <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setViewMode('grid')}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: viewMode === 'grid' ? 'var(--bg-elevated)' : 'transparent',
              color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
            title="Grid view"
          >
            <LayoutGrid size={14} />
            Grid
          </button>
          <button
            onClick={() => setViewMode('flashcard')}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: viewMode === 'flashcard' ? 'var(--bg-elevated)' : 'transparent',
              color: viewMode === 'flashcard' ? 'var(--text-primary)' : 'var(--text-muted)',
              borderLeft: '1px solid var(--border)',
            }}
            title="Flashcard view — sort untagged contacts"
          >
            <CreditCard size={14} />
            Flashcard {untagged.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>{untagged.length}</span>}
          </button>
          <button
            onClick={() => setViewMode('outreach')}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: viewMode === 'outreach' ? 'var(--bg-elevated)' : 'transparent',
              color: viewMode === 'outreach' ? 'var(--text-primary)' : 'var(--text-muted)',
              borderLeft: '1px solid var(--border)',
            }}
            title="Outreach Coach — draft re-engagement emails for stale contacts"
          >
            <Sparkles size={14} />
            Outreach
          </button>
        </div>
      </div>

      {/* Results count (grid only) */}
      {viewMode === 'grid' && (search || filterTag || filterFollowUp) && !mergeMode && (
        <p className="text-xs -mt-2" style={{ color: 'var(--text-muted)' }}>
          Showing {filtered.length} of {contacts.length} contacts
        </p>
      )}

      {/* Merge mode banner */}
      {mergeMode && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border" style={{ backgroundColor: 'rgba(139,92,246,0.1)', borderColor: 'rgba(139,92,246,0.4)' }}>
          <div className="flex items-center gap-2">
            <Shuffle size={15} style={{ color: '#a78bfa' }} />
            <span className="text-sm font-medium" style={{ color: '#c4b5fd' }}>
              {mergeSelectedIds.length === 0 && 'Select two contacts to merge'}
              {mergeSelectedIds.length === 1 && 'Select one more contact'}
              {mergeSelectedIds.length === 2 && `Ready to merge: ${mergeContactA?.name} + ${mergeContactB?.name}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exitMergeMode} className="text-xs" style={{ color: 'var(--text-muted)' }}>Cancel</button>
            {mergeSelectedIds.length === 2 && (
              <button
                onClick={() => setMergeModalOpen(true)}
                className="caesar-btn-primary text-sm flex items-center gap-1.5 px-4 py-2"
                style={{ backgroundColor: '#7c3aed' }}
              >
                <Check size={13} />
                Merge
              </button>
            )}
          </div>
        </div>
      )}

      {/* Outreach Coach view */}
      {viewMode === 'outreach' && (
        <OutreachCoach
          contacts={contacts}
          setContacts={setContacts}
          projects={projects}
        />
      )}

      {/* Flashcard view */}
      {viewMode === 'flashcard' && (
        <FlashcardView
          deck={flashcardDeck}
          contactTags={contactTags}
          setContacts={setContacts}
          shuffled={flashcardShuffled}
          onShuffleToggle={() => setFlashcardShuffled((s) => !s)}
          onBackToGrid={() => setViewMode('grid')}
          onDelete={handleDelete}
          onEdit={openEdit}
          isModalOpen={editModalOpen}
        />
      )}

      {/* Contact Grid (only when grid view) */}
      {viewMode === 'grid' && (filtered.length === 0 ? (
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
      ) : groupBy === 'none' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              contactTags={contactTags}
              onEdit={() => openEdit(contact)}
              onDelete={() => handleDelete(contact.id)}
              onDetail={() => openDetail(contact)}
              onLogInteraction={() => openLog(contact)}
              onSendEmail={() => openCompose(contact)}
              onViewEmails={() => openThread(contact)}
              onUpdateTags={(tags) => setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, tags } : c))}
              mergeMode={mergeMode}
              isSelectedForMerge={mergeSelectedIds.includes(contact.id)}
              onToggleMerge={() => toggleMergeSelect(contact.id)}
            />
          ))}
        </div>
      ) : (
        (() => {
          const getKey = (c: Contact) => {
            if (groupBy === 'tag') return c.tags[0] ?? 'Untagged';
            if (groupBy === 'company') return c.company?.trim() || 'No Company';
            return 'Other';
          };
          const groups: Record<string, Contact[]> = {};
          filtered.forEach(c => {
            const key = getKey(c);
            if (!groups[key]) groups[key] = [];
            groups[key].push(c);
          });
          const sorted = Object.entries(groups).sort(([a], [b]) =>
            a === 'Unknown' || a === 'Untagged' || a === 'No Company' ? 1 : a.localeCompare(b)
          );
          return (
            <div className="flex flex-col gap-6">
              {sorted.map(([groupName, groupContacts]) => (
                <div key={groupName}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      {groupName}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                      {groupContacts.length}
                    </span>
                    <hr className="flex-1" style={{ borderColor: 'var(--border)' }} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {groupContacts.map(contact => (
                      <ContactCard
                        key={contact.id}
                        contact={contact}
                        contactTags={contactTags}
                        onEdit={() => openEdit(contact)}
                        onDelete={() => handleDelete(contact.id)}
                        onDetail={() => openDetail(contact)}
                        onLogInteraction={() => openLog(contact)}
                        onSendEmail={() => openCompose(contact)}
                        onViewEmails={() => openThread(contact)}
                        onUpdateTags={(tags) => setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, tags } : c))}
                        mergeMode={mergeMode}
                        isSelectedForMerge={mergeSelectedIds.includes(contact.id)}
                        onToggleMerge={() => toggleMergeSelect(contact.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      ))}

      {/* Add Contact Modal */}
      <ContactFormModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSave={handleAdd}
        title="Add New Contact"
        contactTags={contactTags}
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
          } as any}
          title={`Edit — ${selectedContact.name}`}
          contactTags={contactTags}
        />
      )}

      {/* Contact Detail Modal */}
      <ContactDetailModal
        isOpen={detailModalOpen}
        onClose={() => { setDetailModalOpen(false); setSelectedContact(null); }}
        contact={selectedContact}
        contactTags={contactTags}
        setContactTags={setContactTags}
        projects={projects}
        onUpdate={handleUpdateContact}
        onSendEmail={() => selectedContact && openCompose(selectedContact)}
        onViewEmails={() => selectedContact && openThread(selectedContact)}
        onEnrich={(c) => enrichContacts([c])}
        enriching={!!selectedContact && enriching.has(selectedContact.id)}
      />

      {/* Quick Log Modal */}
      <QuickLogModal
        isOpen={logModalOpen}
        onClose={() => { setLogModalOpen(false); setSelectedContact(null); }}
        contact={selectedContact}
        onLog={handleLogInteraction}
      />

      {/* Email Compose Modal */}
      {composeModalOpen && selectedContact?.email && (
        <EmailComposeModal
          to={selectedContact.email}
          toName={selectedContact.name}
          onSent={() => setComposeModalOpen(false)}
          onClose={() => setComposeModalOpen(false)}
        />
      )}

      {/* Merge Contacts Modal */}
      {mergeModalOpen && mergeContactA && mergeContactB && (
        <MergeContactsModal
          isOpen={mergeModalOpen}
          onClose={() => setMergeModalOpen(false)}
          contactA={mergeContactA}
          contactB={mergeContactB}
          onMerge={handleMerge}
        />
      )}

      {/* Email Thread Modal */}
      {threadModalOpen && selectedContact?.email && (
        <EmailThread
          email={selectedContact.email}
          contactName={selectedContact.name}
          onClose={() => setThreadModalOpen(false)}
          onCompose={() => { setThreadModalOpen(false); setComposeModalOpen(true); }}
        />
      )}

      {/* Manage Tags Modal */}
      {manageTagsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="caesar-card w-full max-w-md flex flex-col gap-4" style={{ maxHeight: '80vh', overflow: 'auto' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Manage Tags</h2>
              <button onClick={() => { setManageTagsOpen(false); setEditingTag(null); setNewTagValue(''); setNewTagParent(''); }}>
                <X size={18} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            {/* Existing tags — hierarchical */}
            <div className="flex flex-col gap-1.5">
              {/* Top-level tags + their sub-tags */}
              {contactTags.filter(t => !t.parent).map((raw, i) => {
                const t = normalizeTag(raw, i);
                const subTags = contactTags.filter(st => st.parent === t.name);
                return (
                  <div key={t.name}>
                    {/* Parent tag row */}
                    <div className="flex items-center gap-2">
                      {editingTag?.original === t.name ? (
                        <>
                          <input type="color" value={editingTag.color}
                            onChange={(e) => setEditingTag({ ...editingTag, color: e.target.value })}
                            className="w-8 h-8 rounded cursor-pointer flex-shrink-0"
                            style={{ border: 'none', padding: 0, background: 'none' }} />
                          <input autoFocus value={editingTag.value}
                            onChange={(e) => setEditingTag({ ...editingTag, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const trimmed = editingTag.value.trim();
                                if (!trimmed || (trimmed !== t.name && contactTags.some(x => x.name === trimmed))) return;
                                setContactTags(contactTags.map(x => x.name === t.name ? { ...x, name: trimmed, color: editingTag.color } : x.parent === t.name ? { ...x, parent: trimmed } : x));
                                setContacts(prev => prev.map(c => ({ ...c, tags: c.tags.map(n => n === t.name ? trimmed : n) })));
                                setEditingTag(null);
                              } else if (e.key === 'Escape') { setEditingTag(null); }
                            }}
                            className="flex-1 px-2 py-1 rounded text-sm"
                            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }} />
                          <button onClick={() => {
                            const trimmed = editingTag.value.trim();
                            if (!trimmed || (trimmed !== t.name && contactTags.some(x => x.name === trimmed))) return;
                            setContactTags(contactTags.map(x => x.name === t.name ? { ...x, name: trimmed, color: editingTag.color } : x.parent === t.name ? { ...x, parent: trimmed } : x));
                            setContacts(prev => prev.map(c => ({ ...c, tags: c.tags.map(n => n === t.name ? trimmed : n) })));
                            setEditingTag(null);
                          }}><Check size={16} style={{ color: 'var(--accent)' }} /></button>
                          <button onClick={() => setEditingTag(null)}><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
                        </>
                      ) : (
                        <>
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                          <span className="flex-1 text-sm px-2 py-1 rounded font-medium"
                            style={{ color: t.color, backgroundColor: `${t.color}15`, border: `1px solid ${t.color}40` }}>
                            {t.name}
                          </span>
                          <button
                            onClick={() => { setNewTagParent(t.name); setNewTagColor(t.color); setNewTagValue(''); }}
                            title="Add sub-tag"
                            className="text-xs px-1.5 py-0.5 rounded transition-colors"
                            style={{ color: 'var(--text-muted)', border: '1px dashed var(--border)' }}
                          >+sub</button>
                          <button onClick={() => setEditingTag({ original: t.name, value: t.name, color: t.color })} title="Rename / recolor">
                            <Pencil size={14} style={{ color: 'var(--text-muted)' }} />
                          </button>
                          <button onClick={() => {
                            if (!window.confirm(`Delete "${t.name}"? Sub-tags will become top-level.`)) return;
                            setContactTags(contactTags.filter(x => x.name !== t.name).map(x => x.parent === t.name ? { ...x, parent: undefined } : x));
                            setContacts(prev => prev.map(c => ({ ...c, tags: c.tags.filter(n => n !== t.name) })));
                          }} title="Delete"><Trash2 size={14} style={{ color: 'var(--text-muted)' }} /></button>
                        </>
                      )}
                    </div>

                    {/* Sub-tag rows */}
                    {subTags.map((rawSt) => {
                      const st = normalizeTag(rawSt, contactTags.indexOf(rawSt));
                      return (
                        <div key={st.name} className="flex items-center gap-2 mt-1 pl-5">
                          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>└</span>
                          {editingTag?.original === st.name ? (
                            <>
                              <input type="color" value={editingTag.color}
                                onChange={(e) => setEditingTag({ ...editingTag, color: e.target.value })}
                                className="w-7 h-7 rounded cursor-pointer flex-shrink-0"
                                style={{ border: 'none', padding: 0, background: 'none' }} />
                              <input autoFocus value={editingTag.value}
                                onChange={(e) => setEditingTag({ ...editingTag, value: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const trimmed = editingTag.value.trim();
                                    if (!trimmed || (trimmed !== st.name && contactTags.some(x => x.name === trimmed))) return;
                                    setContactTags(contactTags.map(x => x.name === st.name ? { ...x, name: trimmed, color: editingTag.color } : x));
                                    setContacts(prev => prev.map(c => ({ ...c, tags: c.tags.map(n => n === st.name ? trimmed : n) })));
                                    setEditingTag(null);
                                  } else if (e.key === 'Escape') { setEditingTag(null); }
                                }}
                                className="flex-1 px-2 py-0.5 rounded text-xs"
                                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }} />
                              <button onClick={() => {
                                const trimmed = editingTag.value.trim();
                                if (!trimmed || (trimmed !== st.name && contactTags.some(x => x.name === trimmed))) return;
                                setContactTags(contactTags.map(x => x.name === st.name ? { ...x, name: trimmed, color: editingTag.color } : x));
                                setContacts(prev => prev.map(c => ({ ...c, tags: c.tags.map(n => n === st.name ? trimmed : n) })));
                                setEditingTag(null);
                              }}><Check size={14} style={{ color: 'var(--accent)' }} /></button>
                              <button onClick={() => setEditingTag(null)}><X size={14} style={{ color: 'var(--text-muted)' }} /></button>
                            </>
                          ) : (
                            <>
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                              <span className="flex-1 text-xs px-2 py-0.5 rounded"
                                style={{ color: st.color, backgroundColor: `${st.color}15`, border: `1px solid ${st.color}40` }}>
                                {st.name}
                              </span>
                              <button onClick={() => setEditingTag({ original: st.name, value: st.name, color: st.color, parent: st.parent })} title="Rename / recolor">
                                <Pencil size={12} style={{ color: 'var(--text-muted)' }} />
                              </button>
                              <button onClick={() => {
                                if (!window.confirm(`Delete sub-tag "${st.name}"?`)) return;
                                setContactTags(contactTags.filter(x => x.name !== st.name));
                                setContacts(prev => prev.map(c => ({ ...c, tags: c.tags.filter(n => n !== st.name) })));
                              }} title="Delete"><Trash2 size={12} style={{ color: 'var(--text-muted)' }} /></button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Orphaned sub-tags whose parent was deleted */}
              {contactTags.filter(t => t.parent && !contactTags.find(p => p.name === t.parent)).map((raw, i) => {
                const t = normalizeTag(raw, i);
                return (
                  <div key={t.name} className="flex items-center gap-2">
                    {editingTag?.original === t.name ? (
                      <>
                        <input type="color" value={editingTag.color}
                          onChange={(e) => setEditingTag({ ...editingTag, color: e.target.value })}
                          className="w-8 h-8 rounded cursor-pointer flex-shrink-0"
                          style={{ border: 'none', padding: 0, background: 'none' }} />
                        <input autoFocus value={editingTag.value}
                          onChange={(e) => setEditingTag({ ...editingTag, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const trimmed = editingTag.value.trim();
                              if (!trimmed || (trimmed !== t.name && contactTags.some(x => x.name === trimmed))) return;
                              setContactTags(contactTags.map(x => x.name === t.name ? { ...x, name: trimmed, color: editingTag.color } : x));
                              setContacts(prev => prev.map(c => ({ ...c, tags: c.tags.map(n => n === t.name ? trimmed : n) })));
                              setEditingTag(null);
                            } else if (e.key === 'Escape') { setEditingTag(null); }
                          }}
                          className="flex-1 px-2 py-1 rounded text-sm"
                          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }} />
                        <button onClick={() => {
                          const trimmed = editingTag.value.trim();
                          if (!trimmed || (trimmed !== t.name && contactTags.some(x => x.name === trimmed))) return;
                          setContactTags(contactTags.map(x => x.name === t.name ? { ...x, name: trimmed, color: editingTag.color } : x));
                          setContacts(prev => prev.map(c => ({ ...c, tags: c.tags.map(n => n === t.name ? trimmed : n) })));
                          setEditingTag(null);
                        }}><Check size={16} style={{ color: 'var(--accent)' }} /></button>
                        <button onClick={() => setEditingTag(null)}><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
                      </>
                    ) : (
                      <>
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                        <span className="flex-1 text-sm px-2 py-1 rounded font-medium"
                          style={{ color: t.color, backgroundColor: `${t.color}15`, border: `1px solid ${t.color}40` }}>
                          {t.name}
                        </span>
                        <button onClick={() => setEditingTag({ original: t.name, value: t.name, color: t.color })} title="Rename / recolor">
                          <Pencil size={14} style={{ color: 'var(--text-muted)' }} />
                        </button>
                        <button onClick={() => {
                          if (!window.confirm(`Delete tag "${t.name}"?`)) return;
                          setContactTags(contactTags.filter(x => x.name !== t.name));
                          setContacts(prev => prev.map(c => ({ ...c, tags: c.tags.filter(n => n !== t.name) })));
                        }} title="Delete"><Trash2 size={14} style={{ color: 'var(--text-muted)' }} /></button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add new tag */}
            <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer flex-shrink-0"
                  style={{ border: 'none', padding: 0, background: 'none' }}
                  title="Pick color"
                />
                <input
                  value={newTagValue}
                  onChange={(e) => setNewTagValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const trimmed = newTagValue.trim();
                      if (!trimmed || contactTags.some(t => t.name === trimmed)) return;
                      setContactTags([...contactTags, { name: trimmed, color: newTagColor, parent: newTagParent || undefined }]);
                      setNewTagValue('');
                      setNewTagParent('');
                    }
                  }}
                  placeholder={newTagParent ? `Sub-tag under "${newTagParent}"…` : 'New tag name…'}
                  className="flex-1 px-3 py-1.5 rounded text-sm"
                  style={{ background: 'var(--bg-elevated)', border: `1px solid ${newTagParent ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text-primary)' }}
                />
                <button
                  onClick={() => {
                    const trimmed = newTagValue.trim();
                    if (!trimmed || contactTags.some(t => t.name === trimmed)) return;
                    setContactTags([...contactTags, { name: trimmed, color: newTagColor, parent: newTagParent || undefined }]);
                    setNewTagValue('');
                    setNewTagParent('');
                  }}
                  className="caesar-btn-primary px-3 py-1.5 text-sm"
                >
                  Add
                </button>
              </div>
              {/* Parent selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Parent:</span>
                <select
                  value={newTagParent}
                  onChange={(e) => setNewTagParent(e.target.value)}
                  className="flex-1 px-2 py-1 rounded text-xs"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="">None (top-level tag)</option>
                  {contactTags.filter(t => !t.parent).map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
