import React, { useRef, useEffect, useState, useCallback } from 'react';
import SignaturePad from 'signature_pad';
import { X, PenLine, Type, RotateCcw, FileCheck } from 'lucide-react';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  contractName: string;
  onSign: (signatureDataUrl: string, signerName: string) => void;
  onClose: () => void;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export function ContractSignModal({ contractName, onSign, onClose }: Props) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const [isEmpty, setIsEmpty] = useState(true);

  // Draw mode
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  // Type mode
  const typeCanvasRef = useRef<HTMLCanvasElement>(null);

  // Set up signature pad
  useEffect(() => {
    if (mode !== 'draw' || !canvasRef.current) return;
    const canvas = canvasRef.current;

    // Resize canvas to DPR
    const resizeCanvas = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      padRef.current?.clear();
    };

    padRef.current = new SignaturePad(canvas, {
      minWidth: 1.5,
      maxWidth: 3,
      penColor: '#0f172a',
      backgroundColor: 'rgba(0,0,0,0)',
    });

    padRef.current.addEventListener('afterUpdateStroke', () => {
      setIsEmpty(padRef.current?.isEmpty() ?? true);
    });

    resizeCanvas();
    return () => { padRef.current?.off(); };
  }, [mode]);

  // Render typed signature on canvas
  useEffect(() => {
    if (mode !== 'type' || !typeCanvasRef.current) return;
    const canvas = typeCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    ctx.scale(ratio, ratio);

    ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

    if (typedName.trim()) {
      ctx.font = `italic ${Math.min(42, Math.floor(220 / Math.max(typedName.length, 1)) + 16)}px "Brush Script MT", "Segoe Script", cursive`;
      ctx.fillStyle = '#0f172a';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(typedName, canvas.offsetWidth / 2, canvas.offsetHeight / 2);
    }

    setIsEmpty(!typedName.trim());
  }, [typedName, mode]);

  const handleClear = () => {
    if (mode === 'draw') { padRef.current?.clear(); setIsEmpty(true); }
    else { setTypedName(''); setIsEmpty(true); }
  };

  const handleConfirm = useCallback(() => {
    let dataUrl: string;
    let signerName = typedName.trim();

    if (mode === 'draw') {
      if (!padRef.current || padRef.current.isEmpty()) return;
      dataUrl = padRef.current.toDataURL('image/png');
    } else {
      if (!typedName.trim() || !typeCanvasRef.current) return;
      dataUrl = typeCanvasRef.current.toDataURL('image/png');
    }

    onSign(dataUrl, signerName || 'Authorized Signatory');
  }, [mode, typedName, onSign]);

  return (
    <>
      <div className="fixed inset-0 z-[70]" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="fixed z-[71] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '90vw', maxWidth: 480,
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4" style={{ color: '#10b981' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Sign Contract</p>
              <p className="text-xs truncate max-w-[260px]" style={{ color: 'var(--text-muted)' }}>{contractName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)]">
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="px-5 pt-4 flex gap-2">
          {(['draw', 'type'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: mode === m ? 'var(--bg-elevated)' : 'transparent',
                color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
                border: `1px solid ${mode === m ? 'var(--border-strong)' : 'transparent'}`,
              }}
            >
              {m === 'draw' ? <PenLine className="w-3 h-3" /> : <Type className="w-3 h-3" />}
              {m === 'draw' ? 'Draw' : 'Type Name'}
            </button>
          ))}
        </div>

        {/* Signature area */}
        <div className="px-5 py-4">
          {mode === 'draw' ? (
            <div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                Sign in the box below using your mouse or finger
              </p>
              <div
                className="rounded-xl overflow-hidden relative"
                style={{
                  border: '1.5px solid var(--border-strong)',
                  backgroundColor: '#fff',
                  height: 140,
                }}
              >
                <canvas
                  ref={canvasRef}
                  className="w-full h-full block"
                  style={{ touchAction: 'none' }}
                />
                {isEmpty && (
                  <p
                    className="absolute inset-0 flex items-center justify-center text-sm pointer-events-none"
                    style={{ color: '#94a3b8' }}
                  >
                    Sign here
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                Type your full name — it will appear as a signature
              </p>
              <input
                autoFocus
                className="caesar-input w-full mb-3"
                placeholder="Your full name"
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
              />
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  border: '1.5px solid var(--border-strong)',
                  backgroundColor: '#fff',
                  height: 100,
                }}
              >
                <canvas
                  ref={typeCanvasRef}
                  className="w-full h-full block"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <button
              onClick={handleClear}
              className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
              style={{ color: 'var(--text-muted)' }}
            >
              <RotateCcw className="w-3 h-3" /> Clear
            </button>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Date: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Action */}
        <div
          className="px-5 py-4 flex gap-2 flex-shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={handleConfirm}
            disabled={isEmpty}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity"
            style={{
              backgroundColor: '#10b981',
              color: '#fff',
              opacity: isEmpty ? 0.4 : 1,
              cursor: isEmpty ? 'not-allowed' : 'pointer',
            }}
          >
            Sign &amp; Download
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
