import { useState } from 'react';
import { X, Search, Plus } from 'lucide-react';
import type { Contact, NetworkingMapState, ContactMapData, CityBuilding, CityBuildingArchetype } from '../../types';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DISTRICT_ORDER = ['byu', 'vanta', 'rockcanyonai', 'neighborhood', 'chapel', 'outskirts'] as const;
const DISTRICT_NAMES: Record<string, string> = {
  byu: 'BYU District', vanta: 'Vanta HQ', rockcanyonai: 'Rock Canyon AI',
  neighborhood: 'Neighborhood', chapel: 'Chapel District', outskirts: 'Outskirts',
};
const ARCHETYPES: CityBuildingArchetype[] = ['tower', 'midrise', 'slab', 'residential', 'warehouse', 'campus', 'spire', 'podiumTower'];

// Auto-position for new buildings: step along a row offset from district center
const NEW_BUILDING_OFFSETS = [
  { x: 22, z: 0 }, { x: -22, z: 0 }, { x: 0, z: 22 }, { x: 0, z: -22 },
  { x: 22, z: 22 }, { x: -22, z: 22 }, { x: 22, z: -22 }, { x: -22, z: -22 },
];

// Approximate district centers (must match DISTRICTS in NetworkView3D.tsx)
const DISTRICT_CENTERS: Record<string, { x: number; z: number }> = {
  byu:          { x:  0, z: -65 },
  vanta:        { x: 65, z:   0 },
  rockcanyonai: { x: 50, z:  65 },
  neighborhood: { x:-65, z:   0 },
  chapel:       { x:-50, z: -55 },
  outskirts:    { x:  0, z:  65 },
};

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

  const [search,       setSearch]       = useState('');
  const [editingName,  setEditingName]  = useState<string | null>(null);
  const [nameInput,    setNameInput]    = useState('');
  const [creatingIn,   setCreatingIn]   = useState<string | null>(null); // districtId being created in
  const [newBldName,   setNewBldName]   = useState('');
  const [newBldType,   setNewBldType]   = useState<CityBuildingArchetype>('midrise');

  const sortedCount   = contacts.filter(c => mapState.contactData[c.id]?.buildingId).length;
  const unsortedCount = contacts.length - sortedCount;

  function assignContact(contactId: string, buildingId: string | null) {
    const prevBuildingId = mapState.contactData[contactId]?.buildingId ?? null;
    onUpdateMapData(contactId, { buildingId: buildingId ?? undefined });
    const updated = buildings.map(b => {
      let ids = b.contactIds.filter(id => id !== contactId);
      if (buildingId && b.id === buildingId) ids = [...ids, contactId];
      if (!buildingId && b.id === prevBuildingId) ids = ids.filter(id => id !== contactId);
      return { ...b, contactIds: ids };
    });
    onUpdateBuildings(updated);
  }

  function renameBuilding(buildingId: string, newName: string) {
    onUpdateBuildings(buildings.map(b => b.id === buildingId ? { ...b, name: newName } : b));
  }

  function commitRename(buildingId: string) {
    if (nameInput.trim()) renameBuilding(buildingId, nameInput.trim());
    setEditingName(null);
  }

  function createBuilding(districtId: string) {
    if (!newBldName.trim()) return;
    const center = DISTRICT_CENTERS[districtId] ?? { x: 0, z: 0 };
    const existing = buildings.filter(b => b.districtId === districtId);
    const offset = NEW_BUILDING_OFFSETS[existing.length % NEW_BUILDING_OFFSETS.length];
    const newBuilding: CityBuilding = {
      id:         `${districtId}-custom-${Date.now()}`,
      districtId,
      name:       newBldName.trim(),
      archetype:  newBldType,
      position:   { x: center.x + offset.x, z: center.z + offset.z },
      contactIds: [],
    };
    onUpdateBuildings([...buildings, newBuilding]);
    setCreatingIn(null);
    setNewBldName('');
    setNewBldType('midrise');
  }

  const q = search.toLowerCase();
  const unsortedContacts = contacts
    .filter(c => !mapState.contactData[c.id]?.buildingId)
    .filter(c => !q || c.name.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q));

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
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* Left: unsorted contacts */}
        <div style={{
          width: 252, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Search bar */}
          <div style={{
            padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.02)',
          }}>
            <Search size={13} color="#64748b" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter unsorted…"
              style={{
                background: 'none', border: 'none', outline: 'none',
                color: '#e2e8f0', fontSize: 12, flex: 1,
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 16 }}>×</button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Unsorted ({contacts.filter(c => !mapState.contactData[c.id]?.buildingId).length})
              {q && ` · showing ${unsortedContacts.length}`}
            </div>

            {unsortedContacts.length === 0 && !q && (
              <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', paddingTop: 24 }}>All contacts sorted</div>
            )}
            {unsortedContacts.length === 0 && q && (
              <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', paddingTop: 24 }}>No matches for "{search}"</div>
            )}

            {unsortedContacts.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 6px',
                borderRadius: 8, marginBottom: 4,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 600, color: '#94a3b8', overflow: 'hidden',
                }}>
                  {mapState.contactData[c.id]?.photo
                    ? <img src={mapState.contactData[c.id]!.photo} style={{ width: 30, height: 30, objectFit: 'cover' }} alt="" />
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
                  {DISTRICT_ORDER.map(did => {
                    const dBuildings = buildings.filter(b => b.districtId === did);
                    if (!dBuildings.length) return null;
                    return (
                      <optgroup key={did} label={DISTRICT_NAMES[did] ?? did}>
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
        </div>

        {/* Right: district columns */}
        <div style={{ flex: 1, overflowX: 'auto', display: 'flex' }}>
          {DISTRICT_ORDER.map(did => {
            const dBuildings = buildings.filter(b => b.districtId === did);
            const dContacts  = contacts.filter(c => {
              const bId = mapState.contactData[c.id]?.buildingId;
              return bId && dBuildings.some(b => b.id === bId);
            });
            const isCreating = creatingIn === did;

            return (
              <div key={did} style={{
                minWidth: 185, borderRight: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', flexDirection: 'column',
              }}>
                {/* District header */}
                <div style={{
                  padding: '12px 10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.01)', flexShrink: 0,
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#7B9EC8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      {DISTRICT_NAMES[did] ?? did}
                    </div>
                    <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>{dContacts.length} contacts</div>
                  </div>
                  <button
                    onClick={() => { setCreatingIn(did); setNewBldName(''); setNewBldType('midrise'); }}
                    title="Add building to this district"
                    style={{
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 6, color: '#7B9EC8', cursor: 'pointer', padding: '3px 6px',
                      display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
                    }}
                  >
                    <Plus size={11} /> Building
                  </button>
                </div>

                {/* Create building form */}
                {isCreating && (
                  <div style={{
                    padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(59,130,246,0.06)', flexShrink: 0,
                  }}>
                    <input
                      autoFocus
                      value={newBldName}
                      onChange={e => setNewBldName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') createBuilding(did); if (e.key === 'Escape') setCreatingIn(null); }}
                      placeholder="Building name…"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'rgba(255,255,255,0.08)', border: '1px solid #3b82f6',
                        borderRadius: 6, color: '#e2e8f0', fontSize: 12, padding: '5px 8px',
                        outline: 'none', marginBottom: 6,
                      }}
                    />
                    <select
                      value={newBldType}
                      onChange={e => setNewBldType(e.target.value as CityBuildingArchetype)}
                      style={{
                        width: '100%', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 6, color: '#94a3b8', fontSize: 11, padding: '4px 6px',
                        marginBottom: 8, cursor: 'pointer',
                      }}
                    >
                      {ARCHETYPES.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => createBuilding(did)}
                        disabled={!newBldName.trim()}
                        style={{
                          flex: 1, background: '#1d4ed8', border: 'none', borderRadius: 6,
                          color: '#fff', fontSize: 11, padding: '5px 0', cursor: 'pointer',
                          opacity: newBldName.trim() ? 1 : 0.4,
                        }}
                      >Create</button>
                      <button
                        onClick={() => setCreatingIn(null)}
                        style={{
                          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 6, color: '#94a3b8', fontSize: 11, padding: '5px 10px', cursor: 'pointer',
                        }}
                      >Cancel</button>
                    </div>
                  </div>
                )}

                {/* Building list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
                  {dBuildings.length === 0 && !isCreating && (
                    <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', paddingTop: 16, fontStyle: 'italic' }}>
                      No buildings — click "+ Building" to add one
                    </div>
                  )}
                  {dBuildings.map(b => {
                    const bContacts = contacts.filter(c => mapState.contactData[c.id]?.buildingId === b.id);
                    return (
                      <div key={b.id} style={{
                        marginBottom: 8, background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 8,
                      }}>
                        {/* Building name (click to rename) */}
                        {editingName === b.id
                          ? (
                            <input
                              autoFocus
                              value={nameInput}
                              onChange={e => setNameInput(e.target.value)}
                              onBlur={() => commitRename(b.id)}
                              onKeyDown={e => { if (e.key === 'Enter') commitRename(b.id); if (e.key === 'Escape') setEditingName(null); }}
                              style={{ fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.08)', border: '1px solid #3b82f6', borderRadius: 4, color: '#e2e8f0', padding: '2px 6px', width: '100%', boxSizing: 'border-box', outline: 'none' }}
                            />
                          ) : (
                            <div
                              onClick={() => { setEditingName(b.id); setNameInput(b.name); }}
                              title="Click to rename"
                              style={{ fontSize: 11, fontWeight: 600, color: '#cbd5e1', cursor: 'text', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{b.name}</span>
                              <span style={{ fontSize: 10, color: '#475569', fontWeight: 400, flexShrink: 0, marginLeft: 4 }}>{bContacts.length}</span>
                            </div>
                          )}
                        {/* Drop target: assign via select */}
                        <select
                          value=""
                          onChange={e => { if (e.target.value) assignContact(e.target.value, b.id); }}
                          style={{ width: '100%', fontSize: 10, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#475569', borderRadius: 4, padding: '2px 4px', cursor: 'pointer', marginBottom: bContacts.length ? 4 : 0 }}
                        >
                          <option value="">+ Add contact…</option>
                          {contacts
                            .filter(c => !mapState.contactData[c.id]?.buildingId)
                            .map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}
                        </select>
                        {/* Assigned contacts */}
                        {bContacts.map(c => (
                          <div key={c.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '3px 0', borderTop: '1px solid rgba(255,255,255,0.05)',
                          }}>
                            <span style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.name}</span>
                            <button
                              onClick={() => assignContact(c.id, null)}
                              title="Unassign"
                              style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                            >×</button>
                          </div>
                        ))}
                        {bContacts.length === 0 && <div style={{ fontSize: 10, color: '#1e293b', fontStyle: 'italic', paddingTop: 2 }}>Empty</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
