import { useMemo } from 'react';
import type { Project, TodoItem, Contact } from '../../types';
import type { WorldViewAppData } from './WorldDataPanel';

interface BlockInfo {
  col: number; row: number;
  cx: number; cz: number;
  zone: string;
  label: string;
}

const HEALTH_COLORS: Record<string, string> = { green: '#4ade80', yellow: '#fbbf24', red: '#ef4444' };

function findLinkedProject(label: string, projects: Project[]): Project | null {
  const lower = label.toLowerCase();
  const direct = projects.find(p => p.name.toLowerCase() === lower);
  if (direct) return direct;
  return projects.find(p =>
    lower.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(lower)
  ) || null;
}

export function WorldBlockDataCard({
  block,
  appData,
}: {
  block: BlockInfo;
  appData: WorldViewAppData;
}) {
  const project = useMemo(() => findLinkedProject(block.label, appData.projects), [block.label, appData.projects]);

  const linkedTodos = useMemo(() => {
    if (!project) return [];
    return appData.todos.filter(t => t.linkedType === 'project' && t.linkedId === project.id && t.status !== 'done');
  }, [project, appData.todos]);

  const linkedContacts = useMemo(() => {
    if (!project) return [];
    return appData.contacts.filter(c => c.linkedProjects.includes(project.id));
  }, [project, appData.contacts]);

  if (!project) return null;

  const highCount = linkedTodos.filter(t => t.priority === 'high').length;

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, marginTop: 6 }}>
      {/* Project link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: HEALTH_COLORS[project.health] || '#64748b',
          boxShadow: `0 0 6px ${HEALTH_COLORS[project.health] || '#64748b'}44`,
        }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0' }}>{project.name}</span>
        <span style={{
          fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em',
          color: project.status === 'active' ? '#4ade80' : '#64748b',
        }}>{project.status}</span>
      </div>

      {/* Next action */}
      {project.nextAction && (
        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6, lineHeight: 1.4 }}>
          <span style={{ color: '#475569', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Next: </span>
          {project.nextAction}
        </div>
      )}

      {/* Todo count */}
      {linkedTodos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: '#64748b' }}>{linkedTodos.length} open todo{linkedTodos.length !== 1 ? 's' : ''}</span>
          {highCount > 0 && (
            <span style={{
              fontSize: 9, background: 'rgba(239,68,68,0.12)', color: '#ef4444',
              borderRadius: 4, padding: '1px 5px', fontWeight: 600,
            }}>{highCount} high</span>
          )}
        </div>
      )}

      {/* Linked contacts */}
      {linkedContacts.length > 0 && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>Team:</span>
          {linkedContacts.slice(0, 3).map(c => (
            <span key={c.id} style={{
              fontSize: 9, background: 'rgba(80,140,220,0.12)', color: '#7EB8F8',
              borderRadius: 4, padding: '1px 6px',
            }}>{c.name.split(' ')[0]}</span>
          ))}
          {linkedContacts.length > 3 && (
            <span style={{ fontSize: 9, color: '#475569' }}>+{linkedContacts.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
}
