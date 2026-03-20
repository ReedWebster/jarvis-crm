import React, { useState, useMemo } from 'react';
import { X, User, Briefcase, Building2, UserSearch, Target, DollarSign, StickyNote, ExternalLink, GitBranch, Lightbulb, Network, ChevronRight } from 'lucide-react';
import type { NexusNode, NexusLinkType, NexusPath } from '../../types/nexus';
import type { Contact, Project, Client, Candidate, Goal, Note } from '../../types';
import { NODE_COLORS } from './nexusColors';

interface Props {
  node: NexusNode;
  nodes: NexusNode[];
  adjacency: Map<string, { neighbor: string; linkType: NexusLinkType }[]>;
  activePath: NexusPath | null;
  pathFrom: string | null;
  onClose: () => void;
  onNavigateToSection: (section: string) => void;
  onStartPath: (fromId: string) => void;
  onSetPathTarget: (toId: string) => void;
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
  contact: 'contacts', project: 'projects', client: 'recruitment',
  candidate: 'recruitment', goal: 'goals', financial: 'financial', note: 'notes',
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

// ─── AI Insights (computed from node data, no API call) ─────────────────────

function computeInsights(node: NexusNode, neighbors: { neighbor: string; linkType: NexusLinkType }[]): string[] {
  const insights: string[] = [];
  const connectionCount = neighbors.length;

  if (node.type === 'contact') {
    const c = node.rawData as Contact;
    if (connectionCount === 0) insights.push('This contact is isolated — consider linking them to a project or introducing them to your network.');
    if (connectionCount >= 5) insights.push(`Hub node: connected to ${connectionCount} entities. This is a key relationship in your network.`);
    if (c.followUpNeeded && c.followUpDate) {
      const daysSince = Math.floor((Date.now() - new Date(c.followUpDate).getTime()) / 86400000);
      if (daysSince > 7) insights.push(`Follow-up overdue by ${daysSince} days.`);
    }
    if (c.lastContacted) {
      const daysSince = Math.floor((Date.now() - new Date(c.lastContacted).getTime()) / 86400000);
      if (daysSince > 30) insights.push(`Last contacted ${daysSince} days ago — consider reaching out.`);
    }
    if (!c.company && !c.email) insights.push('Missing company and email — enrich this contact for better graph connections.');
  }

  if (node.type === 'project') {
    const p = node.rawData as Project;
    if (p.health === 'red') insights.push('Project health is red — needs immediate attention.');
    if (p.status === 'active' && connectionCount < 2) insights.push('Active project with few connections — consider linking key contacts or goals.');
    if (p.keyContacts.length === 0) insights.push('No key contacts assigned — who is responsible?');
  }

  if (node.type === 'goal') {
    const g = node.rawData as Goal;
    if (g.progress < 25 && g.status === 'in-progress') insights.push(`Only ${g.progress}% complete — may need more resources or attention.`);
    if (!g.linkedProjectId) insights.push('Goal not linked to any project — consider creating or linking one.');
  }

  if (node.type === 'client') {
    const cl = node.rawData as Client;
    if (cl.status === 'active' && connectionCount < 2) insights.push('Active client with sparse connections — link related contacts and projects.');
    const overdue = cl.payments.filter(p => p.status === 'overdue');
    if (overdue.length > 0) insights.push(`${overdue.length} overdue payment(s) totaling $${overdue.reduce((s, p) => s + p.amount, 0).toLocaleString()}.`);
  }

  if (insights.length === 0) insights.push('Well-connected entity — no immediate actions suggested.');

  return insights;
}

// ─── Connection list ────────────────────────────────────────────────────────

function ConnectionsList({ neighbors, nodes, onSetPathTarget, pathFrom }: {
  neighbors: { neighbor: string; linkType: NexusLinkType }[];
  nodes: NexusNode[];
  onSetPathTarget: (id: string) => void;
  pathFrom: string | null;
}) {
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  if (neighbors.length === 0) return <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>No connections</div>;

  return (
    <div className="space-y-1 max-h-32 overflow-y-auto">
      {neighbors.slice(0, 15).map(({ neighbor, linkType }) => {
        const n = nodeMap.get(neighbor);
        if (!n) return null;
        return (
          <div key={`${neighbor}-${linkType}`} className="flex items-center gap-2 py-0.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: n.color }} />
            <span className="text-[11px] flex-1 truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{n.label}</span>
            <span className="text-[9px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }}>{linkType}</span>
            {pathFrom && (
              <button
                onClick={() => onSetPathTarget(neighbor)}
                className="text-[9px] px-1 rounded"
                style={{ color: '#FFD700', backgroundColor: 'rgba(255,215,0,0.1)' }}
                title="Find path to this node"
              >
                path
              </button>
            )}
          </div>
        );
      })}
      {neighbors.length > 15 && (
        <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
          +{neighbors.length - 15} more
        </div>
      )}
    </div>
  );
}

// ─── Path display ───────────────────────────────────────────────────────────

function PathDisplay({ path, nodes }: { path: NexusPath; nodes: NexusNode[] }) {
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium mb-1" style={{ color: 'rgba(255,215,0,0.7)' }}>
        Shortest path ({path.distance} hop{path.distance !== 1 ? 's' : ''})
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {path.nodeIds.map((id, i) => {
          const n = nodeMap.get(id);
          return (
            <React.Fragment key={id}>
              {i > 0 && <ChevronRight size={10} style={{ color: 'rgba(255,215,0,0.4)' }} />}
              <span className="text-[10px] px-1.5 py-0.5 rounded-lg" style={{ backgroundColor: (n?.color ?? '#888') + '22', color: n?.color ?? '#888' }}>
                {n?.label ?? id}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Detail sections (unchanged logic, tighter) ────────────────────────────

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
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60A5FA' }}>{t}</span>
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
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(148,163,184,0.15)', color: '#94A3B8' }}>{t}</span>
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

// ─── MAIN PANEL ─────────────────────────────────────────────────────────────

export function NexusDetailPanel({ node, nodes, adjacency, activePath, pathFrom, onClose, onNavigateToSection, onStartPath, onSetPathTarget }: Props) {
  const section = TYPE_SECTIONS[node.type];
  const [tab, setTab] = useState<'details' | 'connections' | 'insights'>('details');

  const neighbors = useMemo(() => adjacency.get(node.id) ?? [], [adjacency, node.id]);
  const insights = useMemo(() => computeInsights(node, neighbors), [node, neighbors]);

  const tabs = [
    { key: 'details' as const, label: 'Details' },
    { key: 'connections' as const, label: `Connections (${neighbors.length})` },
    { key: 'insights' as const, label: 'Insights' },
  ];

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

      {/* Tabs */}
      <div className="flex px-4 gap-1 pt-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-2 py-1.5 text-[11px] font-medium rounded-t-lg transition-colors"
            style={{
              color: tab === t.key ? NODE_COLORS[node.type] : 'rgba(255,255,255,0.3)',
              backgroundColor: tab === t.key ? NODE_COLORS[node.type] + '10' : 'transparent',
              borderBottom: tab === t.key ? `2px solid ${NODE_COLORS[node.type]}` : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === 'details' && (
          <>
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
          </>
        )}

        {tab === 'connections' && (
          <div className="space-y-3">
            <ConnectionsList neighbors={neighbors} nodes={nodes} onSetPathTarget={onSetPathTarget} pathFrom={pathFrom} />
            {activePath && <PathDisplay path={activePath} nodes={nodes} />}
          </div>
        )}

        {tab === 'insights' && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb size={13} style={{ color: '#FFD700' }} />
              <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Smart Insights</span>
            </div>
            {insights.map((insight, i) => (
              <div
                key={i}
                className="text-xs px-3 py-2 rounded-lg"
                style={{ backgroundColor: 'rgba(255,215,0,0.05)', color: 'rgba(255,255,255,0.7)', borderLeft: '2px solid rgba(255,215,0,0.3)' }}
              >
                {insight}
              </div>
            ))}

            {/* Connection stats */}
            <div className="mt-4">
              <div className="text-[11px] font-medium mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Connection Breakdown</div>
              {(() => {
                const typeCounts: Record<string, number> = {};
                for (const n of neighbors) {
                  typeCounts[n.linkType] = (typeCounts[n.linkType] || 0) + 1;
                }
                return Object.entries(typeCounts).map(([type, count]) => (
                  <div key={type} className="flex justify-between py-0.5">
                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{type}</span>
                    <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>{count}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 flex flex-col gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Path finder button */}
        <button
          onClick={() => onStartPath(node.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
          style={{ backgroundColor: 'rgba(255,215,0,0.08)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.15)' }}
        >
          <GitBranch size={12} />
          Find path from this node
        </button>

        {/* Navigate button */}
        {section && (
          <button
            onClick={() => onNavigateToSection(section)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{ backgroundColor: NODE_COLORS[node.type] + '15', color: NODE_COLORS[node.type] }}
          >
            <ExternalLink size={12} />
            Open in {section.charAt(0).toUpperCase() + section.slice(1)}
          </button>
        )}
      </div>
    </div>
  );
}
