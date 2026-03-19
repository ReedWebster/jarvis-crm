import React from 'react';
import { X, User, Briefcase, Building2, UserSearch, Target, DollarSign, StickyNote, ExternalLink } from 'lucide-react';
import type { NexusNode } from '../../types/nexus';
import type { Contact, Project, Client, Candidate, Goal, Note } from '../../types';
import { NODE_COLORS } from './nexusColors';

interface Props {
  node: NexusNode;
  onClose: () => void;
  onNavigateToSection: (section: string) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  contact:   <User size={16} />,
  project:   <Briefcase size={16} />,
  client:    <Building2 size={16} />,
  candidate: <UserSearch size={16} />,
  goal:      <Target size={16} />,
  financial: <DollarSign size={16} />,
  note:      <StickyNote size={16} />,
};

const TYPE_SECTIONS: Record<string, string> = {
  contact: 'contacts',
  project: 'projects',
  client: 'recruitment',
  candidate: 'recruitment',
  goal: 'goals',
  financial: 'financial',
  note: 'notes',
};

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-start gap-3 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="text-[11px] font-medium flex-shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      <span className="text-xs text-right" style={{ color: 'rgba(255,255,255,0.8)' }}>{value}</span>
    </div>
  );
}

function ContactDetail({ data }: { data: Contact }) {
  return (
    <>
      <DetailRow label="Company" value={data.company} />
      <DetailRow label="Email" value={data.email} />
      <DetailRow label="Phone" value={data.phone} />
      <DetailRow label="Relationship" value={data.relationship} />
      <DetailRow label="Last Contacted" value={data.lastContacted} />
      {data.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {data.tags.map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60A5FA' }}>
              {t}
            </span>
          ))}
        </div>
      )}
      {data.followUpNeeded && data.followUpDate && (
        <div className="mt-2 text-xs px-2 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(251,191,36,0.1)', color: '#FBBF24' }}>
          Follow-up: {data.followUpDate}
        </div>
      )}
      {data.interactions.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Recent Interactions</div>
          {data.interactions.slice(-3).reverse().map(i => (
            <div key={i.id} className="text-xs mb-1 pl-2" style={{ color: 'rgba(255,255,255,0.6)', borderLeft: '2px solid rgba(96,165,250,0.3)' }}>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>{i.date}</span> — {i.notes.slice(0, 80)}{i.notes.length > 80 ? '...' : ''}
            </div>
          ))}
        </div>
      )}
      {data.aiEnrichment && (
        <div className="mt-3">
          <div className="text-[11px] font-medium mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>AI Insights</div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{data.aiEnrichment.summary}</p>
        </div>
      )}
    </>
  );
}

function ProjectDetail({ data }: { data: Project }) {
  return (
    <>
      <DetailRow label="Status" value={data.status} />
      <DetailRow label="Health" value={data.health} />
      <DetailRow label="Next Action" value={data.nextAction} />
      <DetailRow label="Due Date" value={data.dueDate} />
      <DetailRow label="Key Contacts" value={data.keyContacts.length > 0 ? data.keyContacts.join(', ') : undefined} />
      <DetailRow label="Meeting Notes" value={data.meetingNotes?.length ?? 0} />
      {data.notes && (
        <div className="mt-2">
          <div className="text-[11px] font-medium mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Notes</div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{data.notes.slice(0, 200)}</p>
        </div>
      )}
    </>
  );
}

function ClientDetail({ data }: { data: Client }) {
  return (
    <>
      <DetailRow label="Company" value={data.company} />
      <DetailRow label="Status" value={data.status} />
      <DetailRow label="Contract Value" value={data.contractValue > 0 ? `$${data.contractValue.toLocaleString()}` : undefined} />
      <DetailRow label="Services" value={data.services.length > 0 ? data.services.join(', ') : undefined} />
      <DetailRow label="Start Date" value={data.startDate} />
      {data.payments.length > 0 && (
        <div className="mt-2">
          <div className="text-[11px] font-medium mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Payments</div>
          {data.payments.slice(-3).map(p => (
            <div key={p.id} className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {p.description}: ${p.amount.toLocaleString()} — <span style={{ color: p.status === 'paid' ? '#34D399' : p.status === 'overdue' ? '#FB7185' : '#FBBF24' }}>{p.status}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CandidateDetail({ data }: { data: Candidate }) {
  return (
    <>
      <DetailRow label="Role" value={data.role} />
      <DetailRow label="Organization" value={data.organization} />
      <DetailRow label="Status" value={data.status} />
      <DetailRow label="Last Contact" value={data.lastContactDate} />
      {data.notes && <DetailRow label="Notes" value={data.notes.slice(0, 150)} />}
    </>
  );
}

function GoalDetail({ data }: { data: Goal }) {
  return (
    <>
      <DetailRow label="Area" value={data.area} />
      <DetailRow label="Period" value={data.period} />
      <DetailRow label="Status" value={data.status} />
      <DetailRow label="Due Date" value={data.dueDate} />
      <div className="mt-2">
        <div className="text-[11px] font-medium mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Progress</div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${data.progress}%`, backgroundColor: '#FB7185' }} />
        </div>
        <div className="text-xs mt-1 text-right" style={{ color: 'rgba(255,255,255,0.4)' }}>{data.progress}%</div>
      </div>
      {data.description && (
        <div className="mt-2">
          <div className="text-[11px] font-medium mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Description</div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{data.description.slice(0, 200)}</p>
        </div>
      )}
    </>
  );
}

function NoteDetail({ data }: { data: Note }) {
  return (
    <>
      {data.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {data.tags.map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(148,163,184,0.15)', color: '#94A3B8' }}>
              {t}
            </span>
          ))}
        </div>
      )}
      <DetailRow label="Created" value={data.createdAt?.slice(0, 10)} />
      <DetailRow label="Pinned" value={data.pinned ? 'Yes' : undefined} />
      {data.content && (
        <div className="mt-2">
          <div className="text-[11px] font-medium mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Content</div>
          <p className="text-xs whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.6)' }}>{data.content.slice(0, 300)}{data.content.length > 300 ? '...' : ''}</p>
        </div>
      )}
    </>
  );
}

export function NexusDetailPanel({ node, onClose, onNavigateToSection }: Props) {
  const section = TYPE_SECTIONS[node.type];

  return (
    <div
      className="absolute top-3 right-3 bottom-3 w-80 z-20 rounded-xl overflow-hidden flex flex-col animate-fade-in"
      style={{ backgroundColor: 'rgba(10,10,15,0.92)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: NODE_COLORS[node.type] + '22', color: NODE_COLORS[node.type] }}>
          {TYPE_ICONS[node.type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>{node.label}</div>
          {node.sublabel && <div className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{node.sublabel}</div>}
        </div>
        <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'rgba(255,255,255,0.3)' }}>
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {node.type === 'contact' && <ContactDetail data={node.rawData as Contact} />}
        {node.type === 'project' && <ProjectDetail data={node.rawData as Project} />}
        {node.type === 'client' && <ClientDetail data={node.rawData as Client} />}
        {node.type === 'candidate' && <CandidateDetail data={node.rawData as Candidate} />}
        {node.type === 'goal' && <GoalDetail data={node.rawData as Goal} />}
        {node.type === 'note' && <NoteDetail data={node.rawData as Note} />}
        {node.type === 'financial' && (
          <>
            <DetailRow label="Type" value="Financial Summary" />
            <DetailRow label="Amount" value={node.sublabel} />
          </>
        )}
      </div>

      {/* Footer */}
      {section && (
        <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => onNavigateToSection(section)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{ backgroundColor: NODE_COLORS[node.type] + '15', color: NODE_COLORS[node.type] }}
          >
            <ExternalLink size={12} />
            Open in {section.charAt(0).toUpperCase() + section.slice(1)}
          </button>
        </div>
      )}
    </div>
  );
}
