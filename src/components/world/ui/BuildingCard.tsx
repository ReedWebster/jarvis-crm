/**
 * BuildingCard — detail card for selected building / linked project.
 * Replaces WorldBlockDataCard with a richer display.
 */
import { useMemo } from 'react';
import type { BlockInfo, WorldViewAppData } from '../types';
import { HEALTH_COLORS, PRIORITY_COLORS } from '../types';

interface BuildingCardProps {
  block: BlockInfo;
  appData: WorldViewAppData;
  onClose: () => void;
  onEnterBuilding?: () => void;
  onNavigate?: (section: string) => void;
}

function findLinkedProject(label: string, projects: WorldViewAppData['projects']) {
  const lower = label.toLowerCase();
  const direct = projects.find(p => p.name.toLowerCase() === lower);
  if (direct) return direct;
  return projects.find(p =>
    lower.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(lower)
  ) || null;
}

export function BuildingCard({ block, appData, onClose, onEnterBuilding, onNavigate }: BuildingCardProps) {
  const project = useMemo(() => findLinkedProject(block.label, appData.projects), [block.label, appData.projects]);

  const linkedTodos = useMemo(() => {
    if (!project) return [];
    return appData.todos.filter(t => t.linkedType === 'project' && t.linkedId === project.id && t.status !== 'done');
  }, [project, appData.todos]);

  const linkedContacts = useMemo(() => {
    if (!project) return [];
    return appData.contacts.filter(c => c.linkedProjects.includes(project.id));
  }, [project, appData.contacts]);

  const highCount = linkedTodos.filter(t => t.priority === 'high').length;

  return (
    <div style={{
      position: 'absolute', top: 16, right: 16, zIndex: 20, width: 280,
      background: 'rgba(8,12,24,0.92)', border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 12, padding: '14px 16px', backdropFilter: 'blur(12px)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.55)',
      animation: 'fadeIn 0.15s ease-out',
    }}>
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 8, right: 10, background: 'none', border: 'none',
          color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1,
        }}
      >
        ×
      </button>

      {/* Block label */}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
        {block.label}
      </div>
      <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        {block.zone}
      </div>

      {/* Linked project info */}
      {project && (
        <>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, marginTop: 6 }}>
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

            {project.nextAction && (
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6, lineHeight: 1.4 }}>
                <span style={{ color: '#475569', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Next: </span>
                {project.nextAction}
              </div>
            )}

            {linkedTodos.length > 0 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: '#64748b' }}>
                  {linkedTodos.length} open todo{linkedTodos.length !== 1 ? 's' : ''}
                </span>
                {highCount > 0 && (
                  <span style={{
                    fontSize: 9, background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                    borderRadius: 4, padding: '1px 5px', fontWeight: 600,
                  }}>{highCount} high</span>
                )}
              </div>
            )}

            {linkedContacts.length > 0 && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
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

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {onEnterBuilding && (
              <button
                onClick={onEnterBuilding}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: 'rgba(60,120,220,0.18)', color: '#7EB8F8',
                  border: '1px solid rgba(100,160,240,0.25)', cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
              >
                Enter Building
              </button>
            )}
            {onNavigate && (
              <button
                onClick={() => onNavigate('projects')}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
              >
                View Project →
              </button>
            )}
          </div>
        </>
      )}

      {!project && (
        <div style={{ fontSize: 10, color: '#475569', fontStyle: 'italic', marginTop: 4 }}>
          No linked project
        </div>
      )}
    </div>
  );
}
