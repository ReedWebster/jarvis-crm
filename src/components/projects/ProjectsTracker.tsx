import React from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import type { Project } from '../../types';
import type { NavSection } from '../layout/Sidebar';

interface Props {
  projects: Project[];
  setProjects: (v: Project[] | ((p: Project[]) => Project[])) => void;
  onNavigate?: (section: NavSection) => void;
}

// Projects that link to a sidebar section
const PROJECT_LINKS: Record<string, NavSection> = {
  'AI in Business Society': 'abs',
};

export function ProjectsTracker({ projects, onNavigate }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="section-title">Projects</h1>

      <div className="flex flex-col gap-1">
        {projects.map((project) => {
          const linkedSection = PROJECT_LINKS[project.name];
          const hasLink = !!linkedSection && !!onNavigate;

          return (
            <div
              key={project.id}
              className="flex items-center justify-between px-4 py-3 rounded-lg transition-colors duration-200"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
              }}
            >
              <span
                className="text-sm font-medium transition-colors duration-200"
                style={{ color: 'var(--text-primary)' }}
              >
                {project.name}
              </span>

              {hasLink && (
                <button
                  onClick={() => onNavigate(linkedSection)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors duration-200"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                  title={`Open ${linkedSection} tab`}
                >
                  <ExternalLink size={12} />
                  <span>Open</span>
                  <ChevronRight size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
