import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Globe, Network, X, Filter, Search, Clock, ChevronUp, ChevronDown } from 'lucide-react';
import type {
  Contact,
  Project,
  ContactMapData,
  NetworkingMapState,
  NetworkManualConnection,
  MapFilters,
  CityBuilding,
} from '../../types';
import { useSupabaseStorage } from '../../hooks/useSupabaseStorage';
import {
  defaultMapState,
  applyFilters,
  forwardGeocode,
} from '../../utils/networkingMap';
import { GeographicView } from './GeographicView';
import NetworkView3D from './NetworkView3D';
import { FollowUpQueue } from './FollowUpQueue';
import { UnplacedContacts } from './UnplacedContacts';
import { ContactSortPanel } from './ContactSortPanel';

const ALL_RELATIONSHIP_TYPES = [
  'Investor', 'Professor', 'Resident', 'Partner', 'Friend',
  'Recruit', 'Mentor', 'Client', 'Colleague', 'Family', 'Other',
] as const;

const DEFAULT_FILTERS: MapFilters = {
  ventureId: 'all',
  relationshipType: 'all',
  location: 'all',
  strength: 'all',
  followUpOnly: false,
  search: '',
};

interface Props {
  contacts: Contact[];
  setContacts: (v: Contact[] | ((p: Contact[]) => Contact[])) => void;
  projects: Project[];
  onNavigateToCRM: () => void;
}

export function NetworkingMap({ contacts, setContacts, projects, onNavigateToCRM }: Props) {
  const [mapState, setMapState] = useSupabaseStorage<NetworkingMapState>(
    'jarvis:networkingMap',
    defaultMapState(),
  );
  const [filters,        setFilters]        = useState<MapFilters>(DEFAULT_FILTERS);
  const [showFilters,    setShowFilters]    = useState(false);
  const [sortPanelOpen,  setSortPanelOpen]  = useState(() => new URLSearchParams(window.location.search).get('sortPanel') === 'true');

  // ─── DERIVED DATA ───────────────────────────────────────────────────────────

  const filteredIds = useMemo(
    () => applyFilters(contacts, projects, mapState, filters),
    [contacts, projects, mapState, filters],
  );

  // Ventures = projects linked to at least one contact
  const linkedProjectIds = useMemo(() => {
    const ids = new Set<string>();
    contacts.forEach(c => c.linkedProjects.forEach(id => ids.add(id)));
    return ids;
  }, [contacts]);

  const ventureOptions = useMemo(
    () => projects.filter(p => linkedProjectIds.has(p.id)),
    [projects, linkedProjectIds],
  );

  // Location options from placed contacts
  const locationOptions = useMemo(() => {
    const labels = new Set<string>();
    Object.values(mapState.contactData).forEach(d => {
      if (d.locationLabel) labels.add(d.locationLabel);
    });
    return [...labels].sort();
  }, [mapState.contactData]);

  // Active filter chips
  const activeFilters: { key: keyof MapFilters; label: string }[] = [];
  if (filters.ventureId !== 'all') {
    const p = projects.find(p => p.id === filters.ventureId);
    if (p) activeFilters.push({ key: 'ventureId', label: `Venture: ${p.name}` });
  }
  if (filters.relationshipType !== 'all') activeFilters.push({ key: 'relationshipType', label: `Type: ${filters.relationshipType}` });
  if (filters.location !== 'all' && filters.location !== '') activeFilters.push({ key: 'location', label: `Location: ${filters.location}` });
  if (filters.strength !== 'all') activeFilters.push({ key: 'strength', label: `Strength: ${filters.strength}` });
  if (filters.followUpOnly) activeFilters.push({ key: 'followUpOnly', label: 'Follow-Up Needed' });

  // ─── CALLBACKS ──────────────────────────────────────────────────────────────

  const updateMapData = (contactId: string, data: Partial<ContactMapData>) => {
    setMapState(prev => ({
      ...prev,
      contactData: {
        ...prev.contactData,
        [contactId]: { ...(prev.contactData[contactId] ?? { contactId, mapNotes: '', strength: 'cold' }), ...data },
      },
    }));
  };

  // ─── SYNC CONTACT ADDRESSES → MAP PINS ──────────────────────────────────────
  // Two strategies:
  //   1. Instant: contact has mapLat/mapLng from autocomplete selection → copy directly.
  //   2. Lazy:    contact has address text only → forward-geocode via Nominatim (rate-limited).
  const geocodingRef = useRef(false);
  useEffect(() => {
    // Strategy 1: contacts with pre-geocoded coords (autocomplete selection)
    contacts.forEach(c => {
      if (c.mapLat === undefined || c.mapLng === undefined) return;
      const d = mapState.contactData[c.id];
      // Sync if the address changed since last sync, or no pin yet
      if (d?.geocodedAddress !== c.address?.trim()) {
        updateMapData(c.id, {
          lat: c.mapLat,
          lng: c.mapLng,
          locationLabel: c.mapLabel ?? '',
          geocodedAddress: c.address?.trim() ?? '',
        });
      }
    });

    // Strategy 2: contacts with plain text address but no pre-geocoded coords
    if (geocodingRef.current) return;
    const pending = contacts.filter(c => {
      if (c.mapLat !== undefined) return false; // already handled above
      if (!c.address?.trim()) return false;
      const d = mapState.contactData[c.id];
      return !d?.geocodedAddress || d.geocodedAddress !== c.address.trim();
    });
    if (pending.length === 0) return;

    geocodingRef.current = true;
    let i = 0;
    const geocodeNext = async () => {
      if (i >= pending.length) { geocodingRef.current = false; return; }
      const contact = pending[i++];
      const result = await forwardGeocode(contact.address!.trim());
      if (result) {
        updateMapData(contact.id, {
          lat: result.lat, lng: result.lng,
          locationLabel: result.label,
          geocodedAddress: contact.address!.trim(),
        });
      } else {
        updateMapData(contact.id, { geocodedAddress: contact.address!.trim() });
      }
      setTimeout(geocodeNext, 1100); // Nominatim rate-limit: 1 req/sec
    };
    geocodeNext();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts]);

  const updateContact = (updated: Contact) => {
    setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const addContact = (contact: Contact, lat: number, lng: number, locationLabel: string) => {
    setContacts(prev => [...prev, contact]);
    setMapState(prev => ({
      ...prev,
      contactData: {
        ...prev.contactData,
        [contact.id]: { contactId: contact.id, mapNotes: '', strength: 'cold', lat, lng, locationLabel },
      },
    }));
  };

  const toggleView = () => {
    setMapState(prev => ({
      ...prev,
      activeView: prev.activeView === 'geographic' ? 'network' : 'geographic',
    }));
  };

  const toggleAutoConnections = () => {
    setMapState(prev => ({ ...prev, showAutoConnections: !prev.showAutoConnections }));
  };

  const saveManualConnection = (conn: NetworkManualConnection) => {
    setMapState(prev => ({ ...prev, manualConnections: [...prev.manualConnections, conn] }));
  };

  const deleteManualConnection = (id: string) => {
    setMapState(prev => ({ ...prev, manualConnections: prev.manualConnections.filter(c => c.id !== id) }));
  };

  const updateNodePositions = (updates: Record<string, ContactMapData>) => {
    setMapState(prev => ({ ...prev, contactData: { ...prev.contactData, ...updates } }));
  };

  const updateOrgs = (orgs: import('../../types').NetworkOrg[]) => {
    setMapState(prev => ({ ...prev, orgs }));
  };

  const updateBuildings = (buildings: CityBuilding[]) => {
    setMapState(prev => ({ ...prev, buildings }));
  };

  const handleBuildingsReady = (autoBuildings: CityBuilding[]) => {
    setMapState(prev => {
      if (prev.buildings && prev.buildings.length > 0) return prev; // already initialized
      return { ...prev, buildings: autoBuildings };
    });
  };

  const clearFilter = (key: keyof MapFilters) => {
    if (key === 'followUpOnly') setFilters(f => ({ ...f, followUpOnly: false }));
    else if (key === 'ventureId') setFilters(f => ({ ...f, ventureId: 'all' }));
    else if (key === 'relationshipType') setFilters(f => ({ ...f, relationshipType: 'all' }));
    else if (key === 'location') setFilters(f => ({ ...f, location: 'all' }));
    else if (key === 'strength') setFilters(f => ({ ...f, strength: 'all' }));
  };

  const clearAllFilters = () => setFilters(DEFAULT_FILTERS);

  const unplacedContacts = contacts.filter(c => {
    const d = mapState.contactData[c.id];
    return !d || d.lat === undefined;
  });

  const followUpContacts = contacts.filter(c => c.followUpNeeded && c.followUpDate);
  const [mobileFollowUpOpen, setMobileFollowUpOpen] = useState(false);

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Top Bar */}
      <div
        className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 border-b flex-shrink-0 flex-wrap"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-lg border overflow-hidden flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setMapState(p => ({ ...p, activeView: 'geographic' }))}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: mapState.activeView === 'geographic' ? 'var(--bg-elevated)' : 'transparent',
              color: mapState.activeView === 'geographic' ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            <Globe size={13} /> Map
          </button>
          <button
            onClick={() => setMapState(p => ({ ...p, activeView: 'network' }))}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: mapState.activeView === 'network' ? 'var(--bg-elevated)' : 'transparent',
              color: mapState.activeView === 'network' ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            <Network size={13} /> Graph
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg border flex-1 min-w-0"
          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}>
          <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            className="flex-1 text-xs bg-transparent outline-none"
            style={{ color: 'var(--text-primary)' }}
            placeholder="Search contacts..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          />
          {filters.search && (
            <button onClick={() => setFilters(f => ({ ...f, search: '' }))}>
              <X size={11} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(f => !f)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs flex-shrink-0"
          style={{
            backgroundColor: showFilters ? 'var(--bg-elevated)' : 'var(--bg-card)',
            borderColor: activeFilters.length > 0 ? 'var(--border-strong)' : 'var(--border)',
            color: activeFilters.length > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
          }}
        >
          <Filter size={12} />
          Filters {activeFilters.length > 0 && `(${activeFilters.length})`}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div
          className="border-b flex-shrink-0 overflow-x-auto"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)', WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 min-w-max">
            {/* Venture */}
            <select
              className="caesar-select text-xs min-w-[130px]"
              value={filters.ventureId}
              onChange={e => setFilters(f => ({ ...f, ventureId: e.target.value }))}
            >
              <option value="all">All Ventures</option>
              {ventureOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {/* Relationship type */}
            <select
              className="caesar-select text-xs min-w-[120px]"
              value={filters.relationshipType}
              onChange={e => setFilters(f => ({ ...f, relationshipType: e.target.value }))}
            >
              <option value="all">All Types</option>
              {ALL_RELATIONSHIP_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>

            {/* Location */}
            {locationOptions.length > 0 && (
              <select
                className="caesar-select text-xs min-w-[130px]"
                value={filters.location}
                onChange={e => setFilters(f => ({ ...f, location: e.target.value }))}
              >
                <option value="all">All Locations</option>
                {locationOptions.map(l => <option key={l}>{l}</option>)}
              </select>
            )}

            {/* Strength */}
            <select
              className="caesar-select text-xs min-w-[120px]"
              value={filters.strength}
              onChange={e => setFilters(f => ({ ...f, strength: e.target.value as never }))}
            >
              <option value="all">All Strengths</option>
              <option value="hot">Hot Lead</option>
              <option value="warm">Warm</option>
              <option value="cold">Cold</option>
              <option value="personal">Personal</option>
            </select>

            {/* Follow-up toggle */}
            <label className="flex items-center gap-2 text-xs cursor-pointer whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={filters.followUpOnly}
                onChange={e => setFilters(f => ({ ...f, followUpOnly: e.target.checked }))}
                className="w-4 h-4"
              />
              Follow-Up Needed
            </label>

            {activeFilters.length > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-xs px-2 py-1 rounded border whitespace-nowrap"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', backgroundColor: 'transparent' }}
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0 flex-wrap border-b"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          {activeFilters.map(({ key, label }) => (
            <span
              key={key}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs border"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {label}
              <button onClick={() => clearFilter(key)} style={{ color: 'var(--text-muted)' }}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden gap-2 sm:gap-3 p-2 sm:p-3 relative">
        {/* Follow-up queue (left side — desktop only) */}
        <div className="flex-shrink-0 w-56 flex flex-col gap-3 overflow-y-auto hidden md:flex">
          <FollowUpQueue
            contacts={followUpContacts}
            onUpdateContact={updateContact}
            onSelectContact={() => {}}
          />
        </div>

        {/* Main map/graph area */}
        <div className="flex-1 min-w-0 rounded-xl overflow-hidden border relative" style={{ borderColor: 'var(--border)' }}>
          {mapState.activeView === 'geographic' ? (
            <GeographicView
              contacts={contacts}
              projects={projects}
              mapState={mapState}
              filteredIds={filteredIds}
              onUpdateMapData={updateMapData}
              onUpdateContact={updateContact}
              onAddContact={addContact}
              onNavigateToCRM={onNavigateToCRM}
            />
          ) : (
            <NetworkView3D
              contacts={contacts}
              projects={projects}
              mapState={mapState}
              filteredIds={filteredIds}
              onUpdateMapData={updateMapData}
              onUpdateContact={updateContact}
              onToggleAutoConnections={toggleAutoConnections}
              onSaveManualConnection={saveManualConnection}
              onDeleteManualConnection={deleteManualConnection}
              onUpdateNodePositions={updateNodePositions}
              onNavigateToCRM={onNavigateToCRM}
              onAddContact={(contact) => setContacts(prev => [...prev, contact])}
              onUpdateOrgs={updateOrgs}
              buildings={mapState.buildings}
              onBuildingsReady={handleBuildingsReady}
              onUpdateBuildings={updateBuildings}
            />
          )}

          {/* Mobile follow-up drawer */}
          <div
            className="md:hidden absolute left-0 right-0 bottom-0 z-20 rounded-t-xl border-t border-x shadow-2xl transition-transform duration-300"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
              maxHeight: '60%',
              transform: mobileFollowUpOpen ? 'translateY(0)' : 'translateY(calc(100% - 48px))',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Drawer handle / toggle */}
            <button
              onClick={() => setMobileFollowUpOpen(o => !o)}
              className="flex items-center justify-between px-4 h-12 flex-shrink-0 w-full"
              style={{ borderBottom: mobileFollowUpOpen ? '1px solid var(--border)' : 'none' }}
            >
              <div className="flex items-center gap-2">
                <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Follow-Up Queue
                </span>
                {followUpContacts.length > 0 && (
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: '#ef4444', color: '#fff' }}>
                    {followUpContacts.length}
                  </span>
                )}
              </div>
              {mobileFollowUpOpen ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />}
            </button>

            {/* Drawer content */}
            <div className="flex-1 overflow-y-auto p-3">
              <FollowUpQueue
                contacts={followUpContacts}
                onUpdateContact={updateContact}
                onSelectContact={() => { setMobileFollowUpOpen(false); }}
              />
            </div>
          </div>
        </div>

        {/* Unplaced contacts (right side — desktop geo view only) */}
        {mapState.activeView === 'geographic' && (
          <div className="flex-shrink-0 w-56 flex flex-col gap-3 overflow-y-auto hidden md:flex">
            <UnplacedContacts
              contacts={unplacedContacts}
              onPlaceContact={() => {}}
            />
          </div>
        )}
      </div>

      {/* Contact Sort Panel (Mode A) */}
      {sortPanelOpen && (
        <ContactSortPanel
          contacts={contacts}
          mapState={mapState}
          onUpdateMapData={updateMapData}
          onUpdateBuildings={updateBuildings}
          onClose={() => setSortPanelOpen(false)}
        />
      )}
    </div>
  );
}
