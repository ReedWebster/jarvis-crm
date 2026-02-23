import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { generateId } from '../../utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({
  success: () => {},
  error: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((message: string, type: ToastType) => {
    const id = generateId();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const remove = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const value: ToastContextValue = {
    success: (msg) => add(msg, 'success'),
    error: (msg) => add(msg, 'error'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast stack */}
      <div
        className="fixed bottom-6 right-6 flex flex-col gap-2 pointer-events-none"
        style={{ zIndex: 9999 }}
      >
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onClose={() => remove(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── Single Toast Item ────────────────────────────────────────────────────────

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const accentColor = toast.type === 'success' ? '#16a34a' : '#dc2626';

  return (
    <div
      className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-300"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
        borderLeft: `3px solid ${accentColor}`,
        boxShadow: 'var(--shadow-card)',
        color: 'var(--text-primary)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(1rem)',
        minWidth: '220px',
        maxWidth: '320px',
      }}
    >
      {toast.type === 'success'
        ? <CheckCircle2 size={15} style={{ color: accentColor, flexShrink: 0 }} />
        : <XCircle size={15} style={{ color: accentColor, flexShrink: 0 }} />
      }
      <span className="flex-1" style={{ color: 'var(--text-secondary)' }}>{toast.message}</span>
      <button
        onClick={onClose}
        className="flex-shrink-0 opacity-40 hover:opacity-100 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  return useContext(ToastContext);
}
