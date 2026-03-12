import { useState } from 'react';
import { X } from 'lucide-react';
import type { Contact, NetworkingMapState, ContactMapData, CityBuilding } from '../../types';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  contacts:          Contact[];
  mapState:          NetworkingMapState;
  onUpdateMapData:   (contactId: string, data: Partial<ContactMapData>) => void;
  onUpdateBuildings: (buildings: CityBuilding[]) => void;
  onClose:           () => void;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export function ContactSortPanel({ contacts, mapState, onUpdateMapData, onUpdateBuildings, onClose }: Props) {
  const buildings = mapState.buildings ?? [];

  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameInput,   setNameInput]   = useState('');

  const sortedCount   = contacts.filter(c => mapState.contactData[c.id]?.buildingId).length;
  const unsortedCount = contacts.length - sortedCount;

  function assignContact(contactId: string, buildingId: string | null) {
    const prevBuildingId = mapState.contactData[contactId]?.buildingId ?? null;

    // Update contactData
    onUpdateMapData(contactId, { buildingId: buildingId ?? undefined });

    // Sync buildings contactIds
    const updated = buildings.map(b => {
      let ids = b.contactIds.filter(id => id !== contactId);
      if (buildingId && b.id === buildingId) ids = [...ids, contactId];
      return { ...b, contactIds: ids };
    });
    // Also remove from previous building
    if (prevBuildingId && prevBuildingId !== buildingId) {
      const idx = updated.findIndex(b => b.id === prevBuildingId);
      if (idx !== -1) updated[idx] = { ...updated[idx], contactIds: updated[idx].contactIds.filter(id => id !== contactId) };
    }
    onUpdateBuildings(updated);
  }

  function renameBuilding(buildingId: string, newName: string) {
    const updated = buildings.map(b => b.id === buildingId ? { ...b, name: newName } : b);
    onUpdateBuildings(updated);
  }

  function startRename(b: CityBuilding) {
    setEditingName(b.id);
    setNameInput(b.name);
  }

  function commitRename(buildingId: string) {
    if (nameInput.trim()) renameBuilding(buildingId, nameInput.trim());
    setEditingName(null);
  }

  const unsortedContacts = contacts.filter(c => !mapState.contactData[c.id]?.buildingId);

  // Group buildings by district
  const districtOrder = ['byu', 'vanta', 'rockcanyonai', 'neighborhood', 'chapel', 'outskirts'];
  const districtNames: Record<string, string> = {
    byu: 'BYU District', vanta: 'Vanta HQ', rockcanyonai: 'Rock Canyon AI',
    neighborhood: 'Neighborhood', chapel: 'Chapel District', outskirts: 'Outskirts',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(8,12,24,0.97)', display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui,sans-serif', color: '#e2e8f0',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(15,20,40,0.9)',
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Sort into City</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {sortedCount} sorted · {unsortedCount} unsorted
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}>
          <X size={20} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', gap: 0 }}>

        {/* Left: unsorted contacts */}
        <div style={{
          width: 240, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)',
          padding: '16px 12px', overflowY: 'auto',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Unsorted ({unsortedCount})
          </div>
          {unsortedContacts.length === 0 && (
            <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', paddingTop: 24 }}>All contacts sorted</div>
          )}
          {unsortedContacts.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 6px',
              borderRadius: 8, marginBottom: 4,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, color: '#94a3b8',
              }}>
                {mapState.contactData[c.id]?.photo
                  ? <img src={mapState.contactData[c.id]!.photo} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                  : getInitials(c.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                {c.company && <div style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.company}</div>}
              </div>
              <select
                value=""
                onChange={e => { if (e.target.value) assignContact(c.id, e.target.value); }}
                style={{ fontSize: 10, background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', borderRadius: 4, padding: '2px 4px', cursor: 'pointer' }}
              >
                <option value="">Place…</option>
                {districtOrder.map(did => {
                  const dBuildings = buildings.filter(b => b.districtId === did);
                  if (!dBuildings.length) return null;
                  return (
                    <optgroup key={did} label={districtNames[did] ?? did}>
                      {dBuildings.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          ))}
        </div>

        {/* Right: district columns */}
        <div style={{ flex: 1, overflowX: 'auto', display: 'flex', gap: 0 }}>
          {districtOrder.map(did => {
            const dBuildings = buildings.filter(b => b.districtId === did);
            const dContacts  = contacts.filter(c => {
              const bId = mapState.contactData[c.id]?.buildingId;
              return bId && dBuildings.some(b => b.id === bId);
            });
            return (
              <div key={did} style={{
                minWidth: 180, borderRight: '1px solid rgba(255,255,255,0.06)',
                padding: '16px 10px', overflowY: 'auto',
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#7B9EC8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                  {districtNames[did] ?? did}
                  <span style={{ color: '#475569', marginLeft: 6, fontWeight: 400 }}>({dContacts.length})</span>
                </div>
                {dBuildings.map(b => {
                  const bContacts = contacts.filter(c => mapState.contactData[c.id]?.buildingId === b.id);
                  return (
                    <div key={b.id} style={{
                      marginBottom: 10, background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 8,
                    }}>
                      {/* Building name */}
                      {editingName === b.id
                        ? (
                          <input
                            autoFocus
                            value={nameInput}
                            onChange={e => setNameInput(e.target.value)}
                            onBlur={() => commitRename(b.id)}
                            onKeyDown={e => { if (e.key === 'Enter') commitRename(b.id); if (e.key === 'Escape') setEditingName(null); }}
                            style={{ fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.08)', border: '1px solid #3b82f6', borderRadius: 4, color: '#e2e8f0', padding: '2px 6px', width: '100%', boxSizing: 'border-box' }}
                          />
                        ) : (
                          <div
                            onClick={() => startRename(b)}
                            style={{ fontSize: 11, fontWeight: 600, color: '#cbd5e1', cursor: 'pointer', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            title="Click to rename"
                          >
                            <span>{b.name}</span>
                            <span style={{ fontSize: 10, color: '#475569', fontWeight: 400 }}>{bContacts.length}</span>
                          </div>
                        )}
                      {/* Sorted contacts */}
                      {bContacts.map(c => (
                        <div key={c.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)',
                        }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.name}</span>
                          <button
                            onClick={() => assignContact(c.id, null)}
                            title="Remove"
                            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                          >×</button>
                        </div>
                      ))}
                      {bContacts.length === 0 && (
                        <div style={{ fontSize: 10, color: '#334155', fontStyle: 'italic', paddingTop: 2 }}>Empty</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
