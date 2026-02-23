import React from 'react';

interface BadgeProps {
  label: string;
  color?: string;
  variant?: 'solid' | 'outline';
  size?: 'xs' | 'sm';
}

export function Badge({ label, color, variant = 'solid', size = 'sm' }: BadgeProps) {
  const sizeClasses = size === 'xs' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center rounded font-medium transition-colors duration-300 ${sizeClasses}`}
      style={{
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-elevated)',
      }}
    >
      {label}
    </span>
  );
}

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const configs: Record<string, { label: string }> = {
    active:        { label: 'Active' },
    'on-hold':     { label: 'On Hold' },
    completed:     { label: 'Completed' },
    'not-started': { label: 'Not Started' },
    'in-progress': { label: 'In Progress' },
    submitted:     { label: 'Submitted' },
    graded:        { label: 'Graded' },
    contacted:     { label: 'Contacted' },
    interviewed:   { label: 'Interviewed' },
    offered:       { label: 'Offered' },
    joined:        { label: 'Joined' },
    declined:      { label: 'Declined' },
    blocked:       { label: 'Blocked' },
    'want-to-read':{ label: 'Want to Read' },
  };
  const config = configs[status] ?? { label: status };
  return <Badge label={config.label} />;
}

export function HealthDot({ health }: { health: 'green' | 'yellow' | 'red' }) {
  const shades = { green: 'var(--health-green)', yellow: 'var(--health-yellow)', red: 'var(--health-red)' };
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full transition-colors duration-300"
      style={{ backgroundColor: shades[health] }}
    />
  );
}
