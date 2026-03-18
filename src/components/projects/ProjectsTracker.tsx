import React, { useState } from 'react';
import { ChevronRight, ExternalLink, Globe, Instagram, Linkedin } from 'lucide-react';
import type { Project, Contact } from '../../types';
import type { NavSection } from '../layout/Sidebar';
import { ProjectDetailView } from './ProjectDetailView';

interface Props {
  projects: Project[];
  setProjects: (v: Project[] | ((p: Project[]) => Project[])) => void;
  contacts?: Contact[];
  onNavigate?: (section: NavSection) => void;
}

// Projects that link to a sidebar section
const PROJECT_LINKS: Record<string, NavSection> = {
  'AI in Business Society': 'abs',
};

interface SocialLink {
  label: string;
  url: string;
  icon: React.ReactNode;
}

const PROJECT_SOCIALS: Record<string, SocialLink[]> = {
  'AI in Business Society': [
    { label: 'Website',   url: 'https://www.aiinbusinesssociety.org/',                        icon: <Globe size={13} /> },
    { label: 'Instagram', url: 'https://www.instagram.com/abs.byu/',                          icon: <Instagram size={13} /> },
    { label: 'LinkedIn',  url: 'https://www.linkedin.com/company/ai-in-business-society',     icon: <Linkedin size={13} /> },
  ],
  'Moat & Shield AI': [
    { label: 'Website',   url: 'https://moatandshieldai.vercel.app/',                         icon: <Globe size={13} /> },
  ],
};

const HEALTH_COLORS: Record<string, string> = {
  green: '#4ade80',
  yellow: '#facc15',
  red: '#f87171',
};

export function ProjectsTracker({ projects, setProjects, contacts = [], onNavigate }: Props) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const selectedProject = selectedProjectId
    ? projects.find(p => p.id === selectedProjectId) ?? null
    : null;

  function handleUpdateProject(updated: Project) {
    setProjects(prev =>
      Array.isArray(prev)
        ? prev.map(p => (p.id === updated.id ? updated : p))
        : prev
    );
  }

  if (selectedProject) {
    return (
      <ProjectDetailView
        project={selectedProject}
        contacts={contacts}
        onBack={() => setSelectedProjectId(null)}
        onUpdate={handleUpdateProject}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="section-title">Projects</h1>

      <div className="flex flex-col gap-1">
        {projects.map((project) => {
          const linkedSection = PROJECT_LINKS[project.name];
          const hasLink = !!linkedSection && !!onNavigate;
          const socials = PROJECT_SOCIALS[project.name] ?? [];

          return (
            <div
              key={project.id}
              className="flex items-center justify-between px-4 py-3 rounded-lg transition-colors duration-200 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
              }}
              onClick={() => setSelectedProjectId(project.id)}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--bg-card)')}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Health dot */}
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: HEALTH_COLORS[project.health] ?? '#6b7280' }}
                  title={`Health: ${project.health}`}
                />

                <span
                  className="text-sm font-medium transition-colors duration-200"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {project.name}
                </span>

                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={s.label}
                    className="flex items-center justify-center transition-colors duration-200"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={e => e.stopPropagation()}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    {s.icon}
                  </a>
                ))}
              </div>

              <div className="flex items-center gap-2 ml-2 shrink-0">
                {hasLink && (
                  <button
                    onClick={e => { e.stopPropagation(); onNavigate(linkedSection); }}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors duration-200"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    title="Open org chart"
                  >
                    <ExternalLink size={12} />
                    <span>Open</span>
                  </button>
                )}
                <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
