import React, { useState, useMemo } from 'react';
import {
  Search, Phone, Mail, Network, ChevronDown, ChevronRight,
  Users, GraduationCap, Globe, UserCheck, X, Copy, Grid, List,
  Pencil, Plus, Trash2, Check,
} from 'lucide-react';
import type { Contact } from '../../types';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type Department = 'faculty' | 'executive' | 'outreach' | 'subgroups';

export interface ABSMember {
  id: string;
  name: string;
  role: string;
  department: Department;
  reportsTo: string | null;
  phone?: string;
  email?: string;
  schoolEmail?: string;
  netId?: string;
  isCurrentUser?: boolean;
}

// ─── INITIAL DATA ─────────────────────────────────────────────────────────────

export const INITIAL_MEMBERS: ABSMember[] = [
  // Faculty
  { id: 'fac_lisa',   name: 'Lisa Thomas',     role: 'Faculty Advisor',                                    department: 'faculty',    reportsTo: null,     phone: '(801) 318-8820' },
  { id: 'fac_sean',   name: 'Sean Bair',        role: 'Faculty Advisor',                                    department: 'faculty',    reportsTo: null,     phone: '(801) 602-7037' },
  { id: 'fac_james',  name: 'James Gaskin',     role: 'Faculty Advisor',                                    department: 'faculty',    reportsTo: null,     phone: '(801) 636-2985' },
  // Executive
  { id: 'luke',    name: 'Luke Sine',        role: 'President',                                             department: 'executive',  reportsTo: null,     phone: '(949) 338-8813' },
  { id: 'reed',    name: 'Reed Webster',     role: 'Co-President',                                          department: 'executive',  reportsTo: 'luke',   phone: '(801) 498-0754', email: 'reedwebster7284@gmail.com', schoolEmail: 'deanbean@byu.edu', netId: 'deanbean', isCurrentUser: true },
  { id: 'george',  name: 'George Varvel',    role: 'VP — Subgroups',                                        department: 'executive',  reportsTo: 'luke',   phone: '(203) 609-3690' },
  { id: 'levi',    name: 'Levi Henstrom',    role: 'VP — Outreach',                                         department: 'executive',  reportsTo: 'luke',   phone: '(763) 257-6511', email: 'levi.henstrom@gmail.com' },
  { id: 'craig',   name: 'Craig Warnick',    role: 'CTO / VP of Technology',                                department: 'executive',  reportsTo: 'luke',   phone: '(801) 652-8321' },
  { id: 'emma',    name: 'Emma Miller',      role: 'Marketing President',                                   department: 'executive',  reportsTo: 'luke',   phone: '(435) 817-1525' },
  { id: 'cooper',  name: 'Cooper Andersen',  role: 'Events & Finance VP',                                   department: 'executive',  reportsTo: 'luke',   phone: '(435) 705-6408', schoolEmail: 'coop3r@byu.edu', netId: 'coop3r' },
  { id: 'loren',   name: 'Loren Stoddard',   role: 'AI Curriculum President / AI Bootcamp President',       department: 'executive',  reportsTo: 'luke',   phone: '(385) 576-5175' },
  // Outreach
  { id: 'ben',     name: 'Ben Brinton',      role: 'Speaker Outreach / Club & Association President',       department: 'outreach',   reportsTo: 'levi',   phone: '(801) 900-1177' },
  { id: 'lars',    name: 'Lars D. Simpson',  role: 'Teacher Outreach President',                            department: 'outreach',   reportsTo: 'levi',   phone: '(385) 685-8390', schoolEmail: 'larss2@byu.edu', email: 'simpsonlars@gmail.com', netId: 'larss2' },
  { id: 'kyle',    name: 'Kyle Ledsema',     role: 'AI Partnerships & Licensing Lead',                      department: 'outreach',   reportsTo: 'levi',   phone: '(385) 580-6978' },
  { id: 'max',     name: 'Max Gentry',       role: 'Nationwide University Outreach President',              department: 'outreach',   reportsTo: 'levi',   phone: '(949) 584-8969' },
  { id: 'spencer', name: 'Spencer Ure',      role: 'Nationwide University Outreach Lead',                   department: 'outreach',   reportsTo: 'max',    phone: '(949) 987-3974' },
  { id: 'cohen',   name: 'Cohen Nordgren',   role: 'Student Outreach President',                            department: 'outreach',   reportsTo: 'levi',   phone: '(801) 598-3977' },
  // Subgroups
  { id: 'kimball', name: 'Kimball Berrett',  role: 'IS Subgroup President',                                 department: 'subgroups',  reportsTo: 'george', phone: '(801) 427-1748', schoolEmail: 'kdber45@byu.edu', netId: 'kdber45' },
  { id: 'trevan',  name: 'Trevan Baxter',    role: 'Semiconductor/AI Policy Subgroup President',            department: 'subgroups',  reportsTo: 'george', phone: '(208) 994-8045', schoolEmail: 'tb628@byu.edu', netId: 'tb628' },
  { id: 'kate',    name: 'Kate Johnson',     role: 'Marketing Subgroup President',                          department: 'subgroups',  reportsTo: 'george', phone: '(925) 490-3157' },
  { id: 'ty',      name: 'Ty Hoagland',      role: 'Marketing Co-President / AI Bootcamp Co-President',    department: 'subgroups',  reportsTo: 'kate',   phone: '(801) 589-0007' },
  { id: 'trent',   name: 'Trent Becker',     role: 'Finance Subgroup President',                            department: 'subgroups',  reportsTo: 'george', phone: '(512) 337-5954' },
  { id: 'caleb',   name: 'Caleb Haymore',    role: 'Finance Co-President',                                  department: 'subgroups',  reportsTo: 'trent',  phone: '(801) 919-7476' },
  { id: 'robbie',  name: 'Robbie Glenn',     role: 'Finance Co-President',                                  department: 'subgroups',  reportsTo: 'trent',  phone: '(801) 669-3563' },
  { id: 'daniel',  name: 'Daniel Johnson',   role: 'Accounting Subgroup President',                         department: 'subgroups',  reportsTo: 'george', phone: '(801) 721-5254', schoolEmail: 'danielpj@byu.edu', netId: 'danielpj' },
  { id: 'jack',    name: 'Jack Sargent',     role: 'Accounting Subgroup Lead',                              department: 'subgroups',  reportsTo: 'daniel', phone: '(801) 513-6734' },
  { id: 'ethan',   name: 'Ethan Faust',      role: 'Accounting Subgroup Lead',                              department: 'subgroups',  reportsTo: 'daniel', phone: '(571) 242-9577' },
  { id: 'nate',    name: 'Nate McCauley',    role: 'Strategy/PM Subgroup Lead',                             department: 'subgroups',  reportsTo: 'george', phone: '(650) 477-7102', schoolEmail: 'nmccaul@byu.edu', netId: 'Nmccaul' },
];

// ─── CONTACT SEED EXPORT ──────────────────────────────────────────────────────

export function getABSContacts(): Contact[] {
  return INITIAL_MEMBERS
    .filter(m => !m.isCurrentUser)
    .map(m => ({
      id: `abs_${m.id}`,
      name: m.name,
      phone: m.phone,
      email: m.email || m.schoolEmail,
      company: 'BYU — AI in Business Society',
      relationship: m.department === 'faculty' ? 'Mentor' : 'Colleague',
      tags: ['ABS'],
      lastContacted: '2026-03-16',
      followUpNeeded: false,
      notes: m.role,
      interactions: [],
      linkedProjects: [],
    }));
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DEPT_CFG: Record<Department, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  faculty:   { label: 'Faculty',   color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  icon: <GraduationCap size={13} /> },
  executive: { label: 'Executive', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  icon: <UserCheck size={13} /> },
  outreach:  { label: 'Outreach',  color: '#10b981', bg: 'rgba(16,185,129,0.12)',  icon: <Globe size={13} /> },
  subgroups: { label: 'Subgroups', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: <Users size={13} /> },
};

const DEPT_ORDER: Department[] = ['faculty', 'executive', 'outreach', 'subgroups'];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function Avatar({ name, dept, size = 36 }: { name: string; dept: Department; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{ width: size, height: size, background: DEPT_CFG[dept].color, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </div>
  );
}

function YouBadge() {
  return (
    <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded font-medium align-middle"
      style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
      You
    </span>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 14,
    width: '100%',
    outline: 'none',
  };
}

// ─── EDIT MODAL ───────────────────────────────────────────────────────────────

const BLANK_MEMBER: ABSMember = {
  id: '',
  name: '',
  role: '',
  department: 'executive',
  reportsTo: null,
  phone: '',
  email: '',
  schoolEmail: '',
  netId: '',
  isCurrentUser: false,
};

function EditModal({
  member,
  allMembers,
  onSave,
  onDelete,
  onClose,
}: {
  member: ABSMember | null; // null = add new
  allMembers: ABSMember[];
  onSave: (m: ABSMember) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const isNew = member === null;
  const [form, setForm] = useState<ABSMember>(
    member ?? { ...BLANK_MEMBER, id: `m_${Date.now()}` }
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof ABSMember>(key: K, value: ABSMember[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave({ ...form, name: form.name.trim(), role: form.role.trim() });
    onClose();
  };

  // Group members by dept for the reports-to dropdown
  const reportOptions = allMembers.filter(m => m.id !== form.id);

  const fieldStyle = inputStyle();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-lg shadow-2xl flex flex-col"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          maxHeight: '90vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {isNew ? 'Add Member' : 'Edit Member'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
          {/* Name + Role */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Full Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="e.g. Jane Smith" style={fieldStyle} autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Role / Title *</label>
              <input value={form.role} onChange={e => set('role', e.target.value)}
                placeholder="e.g. Finance Subgroup Lead" style={fieldStyle} />
            </div>
          </div>

          {/* Department + Reports To */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Department</label>
              <select value={form.department} onChange={e => set('department', e.target.value as Department)}
                style={fieldStyle}>
                {DEPT_ORDER.map(d => (
                  <option key={d} value={d}>{DEPT_CFG[d].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Reports To</label>
              <select value={form.reportsTo ?? ''}
                onChange={e => set('reportsTo', e.target.value || null)}
                style={fieldStyle}>
                <option value="">— Top Level —</option>
                {DEPT_ORDER.map(dept => {
                  const group = reportOptions.filter(m => m.department === dept);
                  if (!group.length) return null;
                  return (
                    <optgroup key={dept} label={DEPT_CFG[dept].label}>
                      {group.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Phone</label>
            <input value={form.phone ?? ''} onChange={e => set('phone', e.target.value)}
              placeholder="(801) 555-1234" style={fieldStyle} />
          </div>

          {/* Emails */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Personal Email</label>
              <input value={form.email ?? ''} onChange={e => set('email', e.target.value)}
                placeholder="name@gmail.com" style={fieldStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>School Email</label>
              <input value={form.schoolEmail ?? ''} onChange={e => set('schoolEmail', e.target.value)}
                placeholder="netid@byu.edu" style={fieldStyle} />
            </div>
          </div>

          {/* Net ID + isCurrentUser */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>BYU Net ID</label>
              <input value={form.netId ?? ''} onChange={e => set('netId', e.target.value)}
                placeholder="e.g. jsmith42" style={fieldStyle} />
            </div>
            <div className="flex items-end pb-1">
              <button
                onClick={() => set('isCurrentUser', !form.isCurrentUser)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full transition-colors"
                style={{
                  backgroundColor: form.isCurrentUser ? 'rgba(59,130,246,0.12)' : 'var(--bg-elevated)',
                  border: `1px solid ${form.isCurrentUser ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
                  color: form.isCurrentUser ? '#3b82f6' : 'var(--text-muted)',
                }}>
                <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: form.isCurrentUser ? '#3b82f6' : 'transparent', border: `2px solid ${form.isCurrentUser ? '#3b82f6' : 'var(--border)'}` }}>
                  {form.isCurrentUser && <Check size={10} color="white" />}
                </div>
                Mark as "You"
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-6 pt-4 flex-shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}>
          {!isNew ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Sure?</span>
                <button
                  onClick={() => { onDelete(form.id); onClose(); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ backgroundColor: '#ef444420', color: '#ef4444', border: '1px solid #ef444440' }}>
                  Yes, Remove
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ color: '#ef4444', backgroundColor: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#ef444415')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                <Trash2 size={13} /> Remove
              </button>
            )
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm transition-colors"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={!form.name.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: form.name.trim() ? '#3b82f6' : 'var(--bg-elevated)',
                color: form.name.trim() ? '#fff' : 'var(--text-muted)',
                cursor: form.name.trim() ? 'pointer' : 'not-allowed',
              }}>
              {isNew ? 'Add Member' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MEMBER DETAIL MODAL ──────────────────────────────────────────────────────

function MemberModal({ member, allMembers, onEdit, onClose }: {
  member: ABSMember;
  allMembers: ABSMember[];
  onEdit: () => void;
  onClose: () => void;
}) {
  const manager = member.reportsTo ? allMembers.find(m => m.id === member.reportsTo) : null;
  const directReports = allMembers.filter(m => m.reportsTo === member.id);
  const cfg = DEPT_CFG[member.department];
  const copy = (text: string) => navigator.clipboard.writeText(text);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="rounded-2xl p-6 w-full max-w-md shadow-2xl"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <Avatar name={member.name} dept={member.department} size={52} />
            <div>
              <div className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                {member.name}{member.isCurrentUser && <YouBadge />}
              </div>
              <div className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{member.role}</div>
              <div className="flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium w-fit"
                style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                {cfg.icon}<span className="ml-1">{cfg.label}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onEdit}
              className="p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs px-2"
              style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
              <Pencil size={12} /> Edit
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg transition-colors ml-1"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Contact info */}
        <div className="space-y-2 mb-5">
          {member.phone && (
            <div className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                <Phone size={14} style={{ color: 'var(--text-muted)' }} />{member.phone}
              </div>
              <div className="flex gap-1">
                <a href={`tel:${member.phone.replace(/\D/g, '')}`} className="px-2 py-1 rounded text-xs"
                  style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>Call</a>
                <button onClick={() => copy(member.phone!)} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}><Copy size={12} /></button>
              </div>
            </div>
          )}
          {(member.email || member.schoolEmail) && (
            <div className="py-2 px-3 rounded-lg space-y-2" style={{ backgroundColor: 'var(--bg-elevated)' }}>
              {[member.email, member.schoolEmail].filter(Boolean).map(addr => (
                <div key={addr} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                    <Mail size={14} style={{ color: 'var(--text-muted)' }} />{addr}
                  </div>
                  <div className="flex gap-1">
                    <a href={`mailto:${addr}`} className="px-2 py-1 rounded text-xs"
                      style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#10b981' }}>Email</a>
                    <button onClick={() => copy(addr!)} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}><Copy size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {member.netId && (
            <div className="flex items-center gap-2 py-2 px-3 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
              <GraduationCap size={14} />Net ID: <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{member.netId}</span>
            </div>
          )}
        </div>

        {/* Hierarchy */}
        {(manager || directReports.length > 0) && (
          <div className="space-y-3">
            {manager && (
              <div>
                <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Reports To</div>
                <div className="flex items-center gap-2.5 py-2 px-3 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                  <Avatar name={manager.name} dept={manager.department} size={30} />
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{manager.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{manager.role}</div>
                  </div>
                </div>
              </div>
            )}
            {directReports.length > 0 && (
              <div>
                <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Direct Reports ({directReports.length})</div>
                <div className="space-y-1.5">
                  {directReports.map(r => (
                    <div key={r.id} className="flex items-center gap-2.5 py-2 px-3 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                      <Avatar name={r.name} dept={r.department} size={30} />
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{r.name}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DIRECTORY TAB ────────────────────────────────────────────────────────────

function DirectoryTab({ members, onSelect, onEdit }: {
  members: ABSMember[];
  onSelect: (m: ABSMember) => void;
  onEdit: (m: ABSMember) => void;
}) {
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const filtered = useMemo(() => members.filter(m => {
    if (dept !== 'all' && m.department !== dept) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q);
    }
    return true;
  }), [members, search, dept]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search members..."
            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </div>
        <div className="flex gap-1 p-1 rounded-lg flex-wrap"
          style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          {(['all', ...DEPT_ORDER] as const).map(d => {
            const count = d === 'all' ? members.length : members.filter(m => m.department === d).length;
            return (
              <button key={d} onClick={() => setDept(d)}
                className="px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all"
                style={{
                  backgroundColor: dept === d ? (d === 'all' ? 'var(--bg-card)' : DEPT_CFG[d].bg) : 'transparent',
                  color: dept === d ? (d === 'all' ? 'var(--text-primary)' : DEPT_CFG[d].color) : 'var(--text-muted)',
                }}>
                {d === 'all' ? 'All' : DEPT_CFG[d].label} ({count})
              </button>
            );
          })}
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <button onClick={() => setViewMode('table')} className="p-1.5 rounded-md transition-colors"
            style={{ backgroundColor: viewMode === 'table' ? 'var(--bg-card)' : 'transparent', color: viewMode === 'table' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            <List size={14} />
          </button>
          <button onClick={() => setViewMode('grid')} className="p-1.5 rounded-md transition-colors"
            style={{ backgroundColor: viewMode === 'grid' ? 'var(--bg-card)' : 'transparent', color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            <Grid size={14} />
          </button>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                {['Member', 'Role', 'Team', 'Phone', 'Email', ''].map((h, i) => (
                  <th key={i} className={`text-left py-2.5 px-4 text-xs font-medium ${i === 2 ? 'hidden md:table-cell' : ''} ${i === 3 || i === 4 ? 'hidden lg:table-cell' : ''}`}
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => {
                const cfg = DEPT_CFG[m.department];
                return (
                  <tr key={m.id} className="group cursor-pointer transition-colors"
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    onClick={() => onSelect(m)}>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={m.name} dept={m.department} size={32} />
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {m.name}{m.isCurrentUser && <YouBadge />}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{m.role}</span>
                    </td>
                    <td className="py-2.5 px-4 hidden md:table-cell">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                        {cfg.icon}{cfg.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 hidden lg:table-cell">
                      {m.phone && (
                        <a href={`tel:${m.phone.replace(/\D/g,'')}`} className="text-xs font-mono transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                          onClick={e => e.stopPropagation()}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                          {m.phone}
                        </a>
                      )}
                    </td>
                    <td className="py-2.5 px-4 hidden lg:table-cell">
                      {(m.email || m.schoolEmail) && (
                        <a href={`mailto:${m.email || m.schoolEmail}`} className="text-xs truncate max-w-[180px] block transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                          onClick={e => e.stopPropagation()}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                          {m.email || m.schoolEmail}
                        </a>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <button
                        onClick={e => { e.stopPropagation(); onEdit(m); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg"
                        style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                        <Pencil size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(m => {
            const cfg = DEPT_CFG[m.department];
            return (
              <div key={m.id} className="group relative rounded-xl transition-all hover:scale-[1.01] cursor-pointer"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = cfg.color + '60'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                onClick={() => onSelect(m)}>
                <button
                  onClick={e => { e.stopPropagation(); onEdit(m); }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg z-10"
                  style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                  <Pencil size={12} />
                </button>
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar name={m.name} dept={m.department} size={40} />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        {m.name}{m.isCurrentUser && <YouBadge />}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{m.role}</div>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mb-2"
                    style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                    {cfg.icon}{cfg.label}
                  </div>
                  {m.phone && (
                    <div className="flex items-center gap-1.5 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      <Phone size={10} />{m.phone}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {filtered.length === 0 && (
        <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
          <Users size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No members match your search</p>
        </div>
      )}
    </div>
  );
}

// ─── ORG CHART TAB ────────────────────────────────────────────────────────────

function OrgNode({ member, allMembers, depth, expanded, onToggle, onSelect, onEdit }: {
  member: ABSMember;
  allMembers: ABSMember[];
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (m: ABSMember) => void;
  onEdit: (m: ABSMember) => void;
}) {
  const children = allMembers.filter(m => m.reportsTo === member.id);
  const isExpanded = expanded.has(member.id);
  const cfg = DEPT_CFG[member.department];

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg group transition-colors"
        style={{ marginLeft: depth * 20 }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
        <button className="flex-shrink-0 transition-colors"
          style={{ color: children.length > 0 ? 'var(--text-muted)' : 'transparent', width: 16 }}
          onClick={e => { e.stopPropagation(); if (children.length > 0) onToggle(member.id); }}>
          {children.length > 0
            ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
            : <span style={{ width: 14, display: 'inline-block' }} />}
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(member)}>
          <Avatar name={member.name} dept={member.department} size={28} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {member.name}{member.isCurrentUser && <YouBadge />}
            </div>
            <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{member.role}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {member.phone && (
            <a href={`tel:${member.phone.replace(/\D/g,'')}`} className="p-1.5 rounded" style={{ color: cfg.color }}
              onClick={e => e.stopPropagation()}>
              <Phone size={13} />
            </a>
          )}
          <button onClick={e => { e.stopPropagation(); onEdit(member); }}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
            <Pencil size={12} />
          </button>
        </div>
        <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium hidden sm:inline ml-1"
          style={{ backgroundColor: cfg.bg, color: cfg.color }}>
          {cfg.label}
        </span>
        {children.length > 0 && (
          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            {children.length}
          </span>
        )}
      </div>
      {isExpanded && children.map(child => (
        <OrgNode key={child.id} member={child} allMembers={allMembers}
          depth={depth + 1} expanded={expanded} onToggle={onToggle} onSelect={onSelect} onEdit={onEdit} />
      ))}
    </div>
  );
}

function OrgChartTab({ members, onSelect, onEdit }: {
  members: ABSMember[];
  onSelect: (m: ABSMember) => void;
  onEdit: (m: ABSMember) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(['luke', 'george', 'levi', 'trent', 'daniel', 'kate', 'max'])
  );
  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const nonFaculty = members.filter(m => m.department !== 'faculty');
  const roots = nonFaculty.filter(m => m.reportsTo === null || !nonFaculty.find(x => x.id === m.reportsTo));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Click member for details · hover for edit/call buttons
        </p>
        <div className="flex gap-2">
          <button onClick={() => setExpanded(new Set(members.map(m => m.id)))}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
            Expand All
          </button>
          <button onClick={() => setExpanded(new Set())}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
            Collapse All
          </button>
        </div>
      </div>

      {/* Faculty advisors */}
      <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-elevated)', border: `1px solid ${DEPT_CFG.faculty.color}30` }}>
        <div className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: DEPT_CFG.faculty.color }}>
          <GraduationCap size={12} /> Faculty Advisors
        </div>
        <div className="space-y-1">
          {members.filter(m => m.department === 'faculty').map(m => (
            <div key={m.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg group transition-colors cursor-pointer"
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              onClick={() => onSelect(m)}>
              <Avatar name={m.name} dept={m.department} size={28} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.name}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.phone}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); onEdit(m); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded"
                style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <Pencil size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main hierarchy */}
      <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <div className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: DEPT_CFG.executive.color }}>
          <UserCheck size={12} /> Organizational Hierarchy
        </div>
        {roots.map(root => (
          <OrgNode key={root.id} member={root} allMembers={nonFaculty}
            depth={0} expanded={expanded} onToggle={toggle} onSelect={onSelect} onEdit={onEdit} />
        ))}
      </div>
    </div>
  );
}

// ─── TEAMS TAB ────────────────────────────────────────────────────────────────

function TeamsTab({ members, onSelect, onEdit }: {
  members: ABSMember[];
  onSelect: (m: ABSMember) => void;
  onEdit: (m: ABSMember) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {DEPT_ORDER.map(dept => {
        const cfg = DEPT_CFG[dept];
        const deptMembers = members.filter(m => m.department === dept);
        return (
          <div key={dept} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${cfg.color}30` }}>
            <div className="px-4 py-3 flex items-center gap-2.5" style={{ backgroundColor: cfg.bg, borderBottom: `1px solid ${cfg.color}20` }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: cfg.color }}>
                {cfg.icon}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm" style={{ color: cfg.color }}>{cfg.label}</div>
                <div className="text-xs" style={{ color: cfg.color + 'aa' }}>{deptMembers.length} members</div>
              </div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-card)' }}>
              {deptMembers.map((m, i) => (
                <div key={m.id} className="group flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer"
                  style={{ borderBottom: i < deptMembers.length - 1 ? '1px solid var(--border)' : 'none', backgroundColor: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  onClick={() => onSelect(m)}>
                  <Avatar name={m.name} dept={m.department} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                      {m.name}{m.isCurrentUser && <YouBadge />}
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{m.role}</div>
                  </div>
                  {m.phone && (
                    <div className="text-xs font-mono flex-shrink-0 hidden sm:block mr-2" style={{ color: 'var(--text-muted)' }}>{m.phone}</div>
                  )}
                  <button onClick={e => { e.stopPropagation(); onEdit(m); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded flex-shrink-0"
                    style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                    <Pencil size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN HUB ─────────────────────────────────────────────────────────────────

interface ABSHubProps {
  members: ABSMember[];
  setMembers: React.Dispatch<React.SetStateAction<ABSMember[]>>;
}

export function ABSHub({ members, setMembers }: ABSHubProps) {
  const [activeTab, setActiveTab] = useState<'directory' | 'orgchart' | 'teams'>('directory');
  const [selected, setSelected] = useState<ABSMember | null>(null);
  const [editTarget, setEditTarget] = useState<ABSMember | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const openEdit = (m?: ABSMember) => {
    setEditTarget(m ?? null);
    setEditOpen(true);
  };

  const handleSave = (m: ABSMember) => {
    setMembers(prev => {
      const idx = prev.findIndex(x => x.id === m.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = m;
        return next;
      }
      return [...prev, m];
    });
  };

  const handleDelete = (id: string) => {
    setMembers(prev => {
      // Reparent children to the deleted member's parent
      const deleted = prev.find(m => m.id === id);
      return prev
        .filter(m => m.id !== id)
        .map(m => m.reportsTo === id ? { ...m, reportsTo: deleted?.reportsTo ?? null } : m);
    });
  };

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
            <Network size={22} color="white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI in Business Society</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>BYU · {members.length} members · Spring 2026</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {DEPT_ORDER.map(d => {
            const cfg = DEPT_CFG[d];
            const count = members.filter(m => m.department === d).length;
            return (
              <div key={d} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.color}30`, color: cfg.color }}>
                {cfg.icon}<span>{cfg.label}: {count}</span>
              </div>
            );
          })}
          <button onClick={() => openEdit()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ backgroundColor: '#3b82f6', color: '#fff' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2563eb')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#3b82f6')}>
            <Plus size={15} /> Add Member
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit"
        style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        {[
          { id: 'directory', label: 'Directory' },
          { id: 'orgchart',  label: 'Org Chart' },
          { id: 'teams',     label: 'By Team' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as typeof activeTab)}
            className="py-1.5 px-5 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: activeTab === t.id ? 'var(--bg-card)' : 'transparent',
              color: activeTab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: activeTab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'directory' && (
        <DirectoryTab members={members} onSelect={setSelected} onEdit={openEdit} />
      )}
      {activeTab === 'orgchart' && (
        <OrgChartTab members={members} onSelect={setSelected} onEdit={openEdit} />
      )}
      {activeTab === 'teams' && (
        <TeamsTab members={members} onSelect={setSelected} onEdit={openEdit} />
      )}

      {/* Detail modal */}
      {selected && !editOpen && (
        <MemberModal
          member={selected}
          allMembers={members}
          onEdit={() => { openEdit(selected); setSelected(null); }}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Edit / add modal */}
      {editOpen && (
        <EditModal
          member={editTarget}
          allMembers={members}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => { setEditOpen(false); setEditTarget(null); }}
        />
      )}
    </div>
  );
}
