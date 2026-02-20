import React from 'react';

interface BadgeProps {
  label: string;
  color?: string;
  variant?: 'solid' | 'outline';
  size?: 'xs' | 'sm';
}

export function Badge({ label, color = '#00CFFF', variant = 'solid', size = 'sm' }: BadgeProps) {
  const sizeClasses = size === 'xs' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs';

  if (variant === 'outline') {
    return (
      <span
        className={`inline-flex items-center rounded font-medium transition-colors duration-300 ${sizeClasses}`}
        style={{ color, border: `1px solid ${color}40`, backgroundColor: `${color}15` }}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded font-medium transition-colors duration-300 ${sizeClasses}`}
      style={{ backgroundColor: `${color}25`, color }}
    >
      {label}
    </span>
  );
}

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const configs: Record<string, { label: string; color: string }> = {
    active: { label: 'Active', color: '#22c55e' },
    'on-hold': { label: 'On Hold', color: '#eab308' },
    completed: { label: 'Completed', color: '#6b7280' },
    'not-started': { label: 'Not Started', color: '#6b7280' },
    'in-progress': { label: 'In Progress', color: '#00CFFF' },
    submitted: { label: 'Submitted', color: '#8b5cf6' },
    graded: { label: 'Graded', color: '#22c55e' },
    contacted: { label: 'Contacted', color: '#3b82f6' },
    interviewed: { label: 'Interviewed', color: '#f59e0b' },
    offered: { label: 'Offered', color: '#8b5cf6' },
    joined: { label: 'Joined', color: '#22c55e' },
    declined: { label: 'Declined', color: '#ef4444' },
    blocked: { label: 'Blocked', color: '#ef4444' },
    'want-to-read': { label: 'Want to Read', color: '#6b7280' },
  };
  const config = configs[status] ?? { label: status, color: '#6b7280' };
  return <Badge label={config.label} color={config.color} />;
}

export function HealthDot({ health }: { health: 'green' | 'yellow' | 'red' }) {
  const colors = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' };
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full transition-colors duration-300"
      style={{ backgroundColor: colors[health], boxShadow: `0 0 6px ${colors[health]}80` }}
    />
  );
}
