import React, { useState, useMemo } from 'react';
import {
  Search, Phone, Mail, Network, ChevronDown, ChevronRight,
  Users, GraduationCap, Globe, UserCheck, X, Copy, Grid, List,
} from 'lucide-react';
import type { Contact } from '../../types';

// ─── DATA ─────────────────────────────────────────────────────────────────────

type Department = 'faculty' | 'executive' | 'outreach' | 'subgroups';

interface ABSMember {
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

const MEMBERS: ABSMember[] = [
  // Faculty
  { id: 'fac_lisa',   name: 'Lisa Thomas',     role: 'Faculty Advisor',                              department: 'faculty',    reportsTo: null,    phone: '(801) 318-8820' },
  { id: 'fac_sean',   name: 'Sean Bair',        role: 'Faculty Advisor',                              department: 'faculty',    reportsTo: null,    phone: '(801) 602-7037' },
  { id: 'fac_james',  name: 'James Gaskin',     role: 'Faculty Advisor',                              department: 'faculty',    reportsTo: null,    phone: '(801) 636-2985' },
  // Executive
  { id: 'luke',    name: 'Luke Sine',        role: 'President',                                    department: 'executive',  reportsTo: null,    phone: '(949) 338-8813' },
  { id: 'reed',    name: 'Reed Webster',     role: 'Co-President',                                 department: 'executive',  reportsTo: 'luke',  phone: '(801) 498-0754', email: 'reedwebster7284@gmail.com', schoolEmail: 'deanbean@byu.edu', netId: 'deanbean', isCurrentUser: true },
  { id: 'george',  name: 'George Varvel',    role: 'VP — Subgroups',                               department: 'executive',  reportsTo: 'luke',  phone: '(203) 609-3690' },
  { id: 'levi',    name: 'Levi Henstrom',    role: 'VP — Outreach',                                department: 'executive',  reportsTo: 'luke',  phone: '(763) 257-6511', email: 'levi.henstrom@gmail.com' },
  { id: 'craig',   name: 'Craig Warnick',    role: 'CTO / VP of Technology',                       department: 'executive',  reportsTo: 'luke',  phone: '(801) 652-8321' },
  { id: 'emma',    name: 'Emma Miller',      role: 'Marketing President',                          department: 'executive',  reportsTo: 'luke',  phone: '(435) 817-1525' },
  { id: 'cooper',  name: 'Cooper Andersen',  role: 'Events & Finance VP',                          department: 'executive',  reportsTo: 'luke',  phone: '(435) 705-6408', schoolEmail: 'coop3r@byu.edu', netId: 'coop3r' },
  { id: 'loren',   name: 'Loren Stoddard',   role: 'AI Curriculum President / AI Bootcamp President', department: 'executive', reportsTo: 'luke', phone: '(385) 576-5175' },
  // Outreach
  { id: 'ben',     name: 'Ben Brinton',      role: 'Speaker Outreach / Club & Association President', department: 'outreach', reportsTo: 'levi',  phone: '(801) 900-1177' },
  { id: 'lars',    name: 'Lars D. Simpson',  role: 'Teacher Outreach President',                   department: 'outreach',  reportsTo: 'levi',  phone: '(385) 685-8390', schoolEmail: 'larss2@byu.edu', email: 'simpsonlars@gmail.com', netId: 'larss2' },
  { id: 'kyle',    name: 'Kyle Ledsema',     role: 'AI Partnerships & Licensing Lead',             department: 'outreach',  reportsTo: 'levi',  phone: '(385) 580-6978' },
  { id: 'max',     name: 'Max Gentry',       role: 'Nationwide University Outreach President',     department: 'outreach',  reportsTo: 'levi',  phone: '(949) 584-8969' },
  { id: 'spencer', name: 'Spencer Ure',      role: 'Nationwide University Outreach Lead',          department: 'outreach',  reportsTo: 'max',   phone: '(949) 987-3974' },
  { id: 'cohen',   name: 'Cohen Nordgren',   role: 'Student Outreach President',                   department: 'outreach',  reportsTo: 'levi',  phone: '(801) 598-3977' },
  // Subgroups
  { id: 'kimball', name: 'Kimball Berrett',  role: 'IS Subgroup President',                        department: 'subgroups', reportsTo: 'george', phone: '(801) 427-1748', schoolEmail: 'kdber45@byu.edu', netId: 'kdber45' },
  { id: 'trevan',  name: 'Trevan Baxter',    role: 'Semiconductor/AI Policy Subgroup President',   department: 'subgroups', reportsTo: 'george', phone: '(208) 994-8045', schoolEmail: 'tb628@byu.edu', netId: 'tb628' },
  { id: 'kate',    name: 'Kate Johnson',     role: 'Marketing Subgroup President',                 department: 'subgroups', reportsTo: 'george', phone: '(925) 490-3157' },
  { id: 'ty',      name: 'Ty Hoagland',      role: 'Marketing Co-President / AI Bootcamp Co-President', department: 'subgroups', reportsTo: 'kate', phone: '(801) 589-0007' },
  { id: 'trent',   name: 'Trent Becker',     role: 'Finance Subgroup President',                   department: 'subgroups', reportsTo: 'george', phone: '(512) 337-5954' },
  { id: 'caleb',   name: 'Caleb Haymore',    role: 'Finance Co-President',                         department: 'subgroups', reportsTo: 'trent',  phone: '(801) 919-7476' },
  { id: 'robbie',  name: 'Robbie Glenn',     role: 'Finance Co-President',                         department: 'subgroups', reportsTo: 'trent',  phone: '(801) 669-3563' },
  { id: 'daniel',  name: 'Daniel Johnson',   role: 'Accounting Subgroup President',                department: 'subgroups', reportsTo: 'george', phone: '(801) 721-5254', schoolEmail: 'danielpj@byu.edu', netId: 'danielpj' },
  { id: 'jack',    name: 'Jack Sargent',     role: 'Accounting Subgroup Lead',                     department: 'subgroups', reportsTo: 'daniel', phone: '(801) 513-6734' },
  { id: 'ethan',   name: 'Ethan Faust',      role: 'Accounting Subgroup Lead',                     department: 'subgroups', reportsTo: 'daniel', phone: '(571) 242-9577' },
  { id: 'nate',    name: 'Nate McCauley',    role: 'Strategy/PM Subgroup Lead',                    department: 'subgroups', reportsTo: 'george', phone: '(650) 477-7102', schoolEmail: 'nmccaul@byu.edu', netId: 'Nmccaul' },
];

const DEPT_CFG: Record<Department, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  faculty:   { label: 'Faculty',   color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  icon: <GraduationCap size={13} /> },
  executive: { label: 'Executive', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  icon: <UserCheck size={13} /> },
  outreach:  { label: 'Outreach',  color: '#10b981', bg: 'rgba(16,185,129,0.12)',  icon: <Globe size={13} /> },
  subgroups: { label: 'Subgroups', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: <Users size={13} /> },
};

// ─── EXPORT: seed contacts ────────────────────────────────────────────────────
export function getABSContacts(): Contact[] {
  return MEMBERS
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

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function Avatar({ name, dept, size = 36 }: { name: string; dept: Department; size?: number }) {
  const cfg = DEPT_CFG[dept];
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{ width: size, height: size, background: cfg.color, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </div>
  );
}

function YouBadge() {
  return (
    <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded font-medium" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
      You
    </span>
  );
}

// ─── MEMBER DETAIL MODAL ──────────────────────────────────────────────────────
function MemberModal({ member, allMembers, onClose }: { member: ABSMember; allMembers: ABSMember[]; onClose: () => void }) {
  const manager = member.reportsTo ? allMembers.find(m => m.id === member.reportsTo) : null;
  const directReports = allMembers.filter(m => m.reportsTo === member.id);
  const cfg = DEPT_CFG[member.department];
  const copy = (text: string) => navigator.clipboard.writeText(text);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 w-full max-w-md shadow-2xl"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <Avatar name={member.name} dept={member.department} size={52} />
            <div>
              <div className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                {member.name}{member.isCurrentUser && <YouBadge />}
              </div>
              <div className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{member.role}</div>
              <div className="flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium w-fit" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                {cfg.icon}<span className="ml-1">{cfg.label}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
            <X size={18} />
          </button>
        </div>

        {/* Contact info */}
        <div className="space-y-2 mb-5">
          {member.phone && (
            <div className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                <Phone size={14} style={{ color: 'var(--text-muted)' }} />{member.phone}
              </div>
              <div className="flex gap-1">
                <a href={`tel:${member.phone.replace(/\D/g, '')}`} className="px-2 py-1 rounded text-xs" style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>Call</a>
                <button onClick={() => copy(member.phone!)} className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }}><Copy size={12} /></button>
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
                    <a href={`mailto:${addr}`} className="px-2 py-1 rounded text-xs" style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#10b981' }}>Email</a>
                    <button onClick={() => copy(addr!)} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}><Copy size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {member.netId && (
            <div className="flex items-center gap-2 py-2 px-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
              <GraduationCap size={14} />BYU Net ID: <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{member.netId}</span>
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
function DirectoryTab({ members, onSelect }: { members: ABSMember[]; onSelect: (m: ABSMember) => void }) {
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
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search members..."
            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex gap-1 p-1 rounded-lg flex-wrap" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          {(['all', 'faculty', 'executive', 'outreach', 'subgroups'] as const).map(d => {
            const count = d === 'all' ? members.length : members.filter(m => m.department === d).length;
            const color = d === 'all' ? undefined : DEPT_CFG[d].color;
            const bg = d === 'all' ? undefined : DEPT_CFG[d].bg;
            return (
              <button key={d} onClick={() => setDept(d)}
                className="px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all"
                style={{
                  backgroundColor: dept === d ? (d === 'all' ? 'var(--bg-card)' : bg) : 'transparent',
                  color: dept === d ? (d === 'all' ? 'var(--text-primary)' : color) : 'var(--text-muted)',
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
                {['Member', 'Role', 'Team', 'Phone', 'Email'].map((h, i) => (
                  <th key={h} className={`text-left py-2.5 px-4 text-xs font-medium ${i > 1 ? 'hidden md:table-cell' : ''} ${i > 2 ? 'hidden lg:table-cell' : ''}`}
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => {
                const cfg = DEPT_CFG[m.department];
                return (
                  <tr key={m.id} className="cursor-pointer transition-colors"
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
                      <span className="text-sm" style={{ color: 'var(--text-secondary, var(--text-muted))' }}>{m.role}</span>
                    </td>
                    <td className="py-2.5 px-4 hidden md:table-cell">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                        {cfg.icon}{cfg.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 hidden lg:table-cell">
                      {m.phone && (
                        <a href={`tel:${m.phone.replace(/\D/g,'')}`} className="text-xs font-mono transition-colors" style={{ color: 'var(--text-muted)' }}
                          onClick={e => e.stopPropagation()}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                          {m.phone}
                        </a>
                      )}
                    </td>
                    <td className="py-2.5 px-4 hidden lg:table-cell">
                      {(m.email || m.schoolEmail) && (
                        <a href={`mailto:${m.email || m.schoolEmail}`} className="text-xs truncate max-w-[200px] block transition-colors" style={{ color: 'var(--text-muted)' }}
                          onClick={e => e.stopPropagation()}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                          {m.email || m.schoolEmail}
                        </a>
                      )}
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
              <button key={m.id} onClick={() => onSelect(m)}
                className="text-left p-4 rounded-xl transition-all hover:scale-[1.01]"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = cfg.color + '60'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}>
                <div className="flex items-center gap-3 mb-3">
                  <Avatar name={m.name} dept={m.department} size={40} />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {m.name}{m.isCurrentUser && <YouBadge />}
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{m.role}</div>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mb-2" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                  {cfg.icon}{cfg.label}
                </div>
                {m.phone && (
                  <div className="flex items-center gap-1.5 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    <Phone size={10} />{m.phone}
                  </div>
                )}
              </button>
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
function OrgNode({ member, allMembers, depth, expanded, onToggle, onSelect }: {
  member: ABSMember;
  allMembers: ABSMember[];
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (m: ABSMember) => void;
}) {
  const children = allMembers.filter(m => m.reportsTo === member.id);
  const isExpanded = expanded.has(member.id);
  const cfg = DEPT_CFG[member.department];

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer group transition-colors"
        style={{ marginLeft: depth * 20 }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <button
          className="flex-shrink-0 transition-colors"
          style={{ color: children.length > 0 ? 'var(--text-muted)' : 'transparent', width: 16 }}
          onClick={e => { e.stopPropagation(); if (children.length > 0) onToggle(member.id); }}>
          {children.length > 0
            ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
            : <span style={{ width: 14, display: 'inline-block' }} />}
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => onSelect(member)}>
          <Avatar name={member.name} dept={member.department} size={28} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {member.name}{member.isCurrentUser && <YouBadge />}
            </div>
            <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{member.role}</div>
          </div>
        </div>
        {member.phone && (
          <a href={`tel:${member.phone.replace(/\D/g,'')}`}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: cfg.color }} onClick={e => e.stopPropagation()}>
            <Phone size={13} />
          </a>
        )}
        <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium hidden sm:inline" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
          {cfg.label}
        </span>
        {children.length > 0 && (
          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            {children.length}
          </span>
        )}
      </div>
      {isExpanded && children.map(child => (
        <OrgNode key={child.id} member={child} allMembers={allMembers}
          depth={depth + 1} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />
      ))}
    </div>
  );
}

function OrgChartTab({ members, onSelect }: { members: ABSMember[]; onSelect: (m: ABSMember) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(['luke', 'george', 'levi', 'trent', 'daniel', 'kate', 'max'])
  );
  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const nonFaculty = members.filter(m => m.department !== 'faculty');
  const roots = nonFaculty.filter(m => m.reportsTo === null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Click any member for contact details. Use arrows to expand/collapse.</p>
        <div className="flex gap-2">
          <button onClick={() => setExpanded(new Set(members.map(m => m.id)))}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
            Expand All
          </button>
          <button onClick={() => setExpanded(new Set(['luke']))}
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
            <div key={m.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg cursor-pointer transition-colors"
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              onClick={() => onSelect(m)}>
              <Avatar name={m.name} dept={m.department} size={28} />
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.name}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.phone}</div>
              </div>
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
            depth={0} expanded={expanded} onToggle={toggle} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

// ─── TEAMS TAB ────────────────────────────────────────────────────────────────
function TeamsTab({ members, onSelect }: { members: ABSMember[]; onSelect: (m: ABSMember) => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {(['faculty', 'executive', 'outreach', 'subgroups'] as Department[]).map(dept => {
        const cfg = DEPT_CFG[dept];
        const deptMembers = members.filter(m => m.department === dept);
        return (
          <div key={dept} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${cfg.color}30` }}>
            <div className="px-4 py-3 flex items-center gap-2.5" style={{ backgroundColor: cfg.bg, borderBottom: `1px solid ${cfg.color}20` }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: cfg.color }}>
                {cfg.icon}
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: cfg.color }}>{cfg.label}</div>
                <div className="text-xs" style={{ color: cfg.color + 'aa' }}>{deptMembers.length} members</div>
              </div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-card)' }}>
              {deptMembers.map((m, i) => (
                <button key={m.id} onClick={() => onSelect(m)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                  style={{ borderBottom: i < deptMembers.length - 1 ? '1px solid var(--border)' : 'none', backgroundColor: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <Avatar name={m.name} dept={m.department} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                      {m.name}{m.isCurrentUser && <YouBadge />}
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{m.role}</div>
                  </div>
                  {m.phone && (
                    <div className="text-xs font-mono flex-shrink-0 hidden sm:block" style={{ color: 'var(--text-muted)' }}>{m.phone}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN HUB ─────────────────────────────────────────────────────────────────
export function ABSHub() {
  const [activeTab, setActiveTab] = useState<'directory' | 'orgchart' | 'teams'>('directory');
  const [selected, setSelected] = useState<ABSMember | null>(null);

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
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>BYU · {MEMBERS.length} members · Spring 2026</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(DEPT_CFG) as Department[]).map(d => {
            const cfg = DEPT_CFG[d];
            const count = MEMBERS.filter(m => m.department === d).length;
            return (
              <div key={d} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.color}30`, color: cfg.color }}>
                {cfg.icon}<span>{cfg.label}: {count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        {[{ id: 'directory', label: 'Directory' }, { id: 'orgchart', label: 'Org Chart' }, { id: 'teams', label: 'By Team' }].map(t => (
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

      {activeTab === 'directory' && <DirectoryTab members={MEMBERS} onSelect={setSelected} />}
      {activeTab === 'orgchart' && <OrgChartTab members={MEMBERS} onSelect={setSelected} />}
      {activeTab === 'teams'    && <TeamsTab    members={MEMBERS} onSelect={setSelected} />}

      {selected && <MemberModal member={selected} allMembers={MEMBERS} onClose={() => setSelected(null)} />}
    </div>
  );
}
