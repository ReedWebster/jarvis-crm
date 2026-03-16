import React, { useState, useRef, useEffect } from 'react';
import { Phone, MessageSquare } from 'lucide-react';

interface PhoneLinkProps {
  phone: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLElement>) => void;
}

export function PhoneLink({ phone, children, className, style, onClick, onMouseEnter, onMouseLeave }: PhoneLinkProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const digits = phone.replace(/\D/g, '');

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        className={className}
        style={{ ...style, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
        onClick={e => {
          e.stopPropagation();
          e.preventDefault();
          onClick?.(e);
          setOpen(v => !v);
        }}
        onMouseEnter={onMouseEnter as any}
        onMouseLeave={onMouseLeave as any}
      >
        {children}
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 py-1 rounded-lg shadow-lg border"
          style={{
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
            minWidth: 120,
          }}
        >
          <a
            href={`tel:${digits}`}
            className="flex items-center gap-2 px-3 py-1.5 text-xs transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-elevated)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={() => setOpen(false)}
          >
            <Phone size={12} /> Call
          </a>
          <a
            href={`sms:${digits}`}
            className="flex items-center gap-2 px-3 py-1.5 text-xs transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-elevated)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={() => setOpen(false)}
          >
            <MessageSquare size={12} /> Text
          </a>
        </div>
      )}
    </div>
  );
}
