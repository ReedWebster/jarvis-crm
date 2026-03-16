import React from 'react';
import { ChevronRight, ExternalLink, Globe, Instagram, Linkedin } from 'lucide-react';
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
};

export function ProjectsTracker({ projects, onNavigate }: Props) {
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
              className="flex items-center justify-between px-4 py-3 rounded-lg transition-colors duration-200"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
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
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    {s.icon}
                  </a>
                ))}
              </div>

              {hasLink && (
                <button
                  onClick={() => onNavigate(linkedSection)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors duration-200 shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                  title="Open org chart"
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
