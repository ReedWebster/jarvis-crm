import React, { useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success, App.tsx's onAuthStateChange listener updates session → re-renders app
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: 'var(--bg)', fontFamily: "'Times New Roman', Times, serif" }}
    >
      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl border shadow-2xl p-8 flex flex-col gap-6"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {/* Logo + Brand */}
        <div className="flex flex-col items-center gap-3">
          <img
            src="/favicon.svg"
            alt="LITEHOUSE"
            className="w-16 h-16 rounded-full"
            style={{ border: '2px solid var(--border)' }}
          />
          <div className="text-center">
            <h1
              className="text-xl font-bold tracking-widest"
              style={{ color: 'var(--text-primary)', letterSpacing: '0.2em' }}
            >
              LITEHOUSE
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Command Center
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t" style={{ borderColor: 'var(--border)' }} />

        {/* Form */}
        <form onSubmit={handleSignIn} className="flex flex-col gap-4">
          <div>
            <label className="caesar-label">Email</label>
            <input
              type="email"
              className="caesar-input w-full mt-1"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="caesar-label">Password</label>
            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                className="caesar-input w-full pr-10"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="text-xs px-3 py-2 rounded-lg border"
              style={{ borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.07)', color: '#dc2626' }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            className="caesar-btn-primary w-full flex items-center justify-center gap-2 mt-1"
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <LogIn size={15} />
            )}
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          Personal access only
        </p>
      </div>
    </div>
  );
}
