import React from 'react';

export function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = value.split(':').map(Number);
  const h24 = parts[0] || 0;
  const m = parts[1] || 0;
  const isPM = h24 >= 12;
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;

  const update = (newH12: number, newMin: number, newIsPM: boolean) => {
    let h = newH12 % 12;
    if (newIsPM) h += 12;
    onChange(`${String(h).padStart(2, '0')}:${String(newMin).padStart(2, '0')}`);
  };

  const selectStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary)',
    fontSize: 14,
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    textAlign: 'center',
    padding: '8px 2px',
    minWidth: 32,
  };

  return (
    <div
      className="flex items-center rounded-lg border"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
    >
      <select value={h12} onChange={(e) => update(Number(e.target.value), m, isPM)}
        style={{ ...selectStyle, paddingLeft: 12 }}>
        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>

      <span style={{ color: 'var(--text-muted)', fontSize: 14, userSelect: 'none', lineHeight: 1 }}>:</span>

      <select value={m} onChange={(e) => update(h12, Number(e.target.value), isPM)}
        style={selectStyle}>
        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((min) => (
          <option key={min} value={min}>{String(min).padStart(2, '0')}</option>
        ))}
      </select>

      <div style={{ width: 1, height: 18, backgroundColor: 'var(--border)', margin: '0 4px' }} />

      <select value={isPM ? 'PM' : 'AM'} onChange={(e) => update(h12, m, e.target.value === 'PM')}
        style={{ ...selectStyle, paddingRight: 10 }}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
