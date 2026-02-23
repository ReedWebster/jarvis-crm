import React, { useState, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMapEvents, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, RotateCcw, X, Plus, MapPin, Locate } from 'lucide-react';
import type { Contact, Project, ContactMapData, NetworkingMapState, RelationshipStrength } from '../../types';
import { generateId, todayStr } from '../../utils';
import {
  getContactStrengthColor,
  getContactInitials,
  getUnplacedContacts,
  reverseGeocode,
  defaultContactMapData,
  isFollowUpPending,
} from '../../utils/networkingMap';
import { ContactMapPopup } from './ContactMapPopup';
import { useTheme } from '../../hooks/useTheme';

// ─── PIN ICON ─────────────────────────────────────────────────────────────────

function createPinIcon(contact: Contact, mapData: ContactMapData, dimmed = false): L.DivIcon {
  const color = getContactStrengthColor(mapData.strength ?? 'cold');
  const initials = getContactInitials(contact.name);
  const hasPending = isFollowUpPending(contact);
  const photo = mapData.photo;

  return L.divIcon({
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -24],
    html: `
      <div style="position:relative;width:40px;height:40px;opacity:${dimmed ? 0.2 : 1}">
        <div style="
          width:40px;height:40px;border-radius:50%;
          border:3px solid ${color};
          background:var(--bg-elevated);
          overflow:hidden;
          display:flex;align-items:center;justify-content:center;
          font-size:12px;font-weight:700;
          color:var(--text-primary);
          box-shadow:0 2px 8px rgba(0,0,0,0.4);
        ">
          ${photo
            ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;" />`
            : initials
          }
        </div>
        ${hasPending ? `
          <div style="
            position:absolute;top:-2px;right:-2px;
            width:10px;height:10px;border-radius:50%;
            background:#f97316;
            border:2px solid var(--bg-card);
            animation:pulse 1.5s ease-in-out infinite;
          "></div>
        ` : ''}
      </div>
    `,
  });
}

// ─── MAP EVENT HANDLERS ───────────────────────────────────────────────────────

function MapClickHandler({
  placingContactId,
  onPlace,
}: {
  placingContactId: string | null;
  onPlace: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (placingContactId) {
        onPlace(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

function ContextMenuHandler({
  onRightClick,
}: {
  onRightClick: (lat: number, lng: number, x: number, y: number) => void;
}) {
  const mapRef = useMap();
  useEffect(() => {
    const container = mapRef.getContainer();
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const point = mapRef.containerPointToLatLng([e.clientX - container.getBoundingClientRect().left, e.clientY - container.getBoundingClientRect().top]);
      onRightClick(point.lat, point.lng, e.clientX, e.clientY);
    };
    container.addEventListener('contextmenu', handleContextMenu);
    return () => container.removeEventListener('contextmenu', handleContextMenu);
  }, [mapRef, onRightClick]);
  return null;
}

function ResetViewButton() {
  const map = useMap();
  return (
    <button
      onClick={() => map.flyTo([39, -98], 4, { duration: 1 })}
      className="absolute bottom-28 left-3 z-[1000] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs shadow-lg"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
      title="Reset view"
    >
      <RotateCcw size={12} />
    </button>
  );
}

function createMyLocationIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `
      <div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
        <div style="
          width:14px;height:14px;border-radius:50%;
          background:#3b82f6;
          border:2.5px solid white;
          box-shadow:0 0 0 6px rgba(59,130,246,0.2);
        "></div>
      </div>
    `,
  });
}

function LocateMeButton({ onLocated }: { onLocated: (lat: number, lng: number) => void }) {
  const map = useMap();
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);

  const locate = () => {
    if (!navigator.geolocation) { setDenied(true); return; }
    setLoading(true);
    setDenied(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setLoading(false);
        map.flyTo([lat, lng], 12, { duration: 1.5 });
        onLocated(lat, lng);
      },
      () => { setLoading(false); setDenied(true); },
      { timeout: 10000 },
    );
  };

  return (
    <button
      onClick={locate}
      className="absolute bottom-20 left-3 z-[1000] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs shadow-lg"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: denied ? 'var(--priority-high)' : 'var(--border)',
        color: denied ? 'var(--priority-high)' : 'var(--text-secondary)',
      }}
      title={denied ? 'Location access denied' : 'Go to my location'}
    >
      {loading
        ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
        : <Locate size={12} />
      }
    </button>
  );
}

// ─── NEW CONTACT MODAL ────────────────────────────────────────────────────────

function NewContactModal({
  lat,
  lng,
  locationLabel,
  onSave,
  onClose,
}: {
  lat: number;
  lng: number;
  locationLabel: string;
  onSave: (contact: Omit<Contact, 'id' | 'interactions' | 'linkedProjects'>, lat: number, lng: number, label: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [strength, setStrength] = useState<RelationshipStrength>('cold');
  const [notes, setNotes] = useState('');

  const save = () => {
    if (!name.trim()) return;
    onSave({
      name, relationship, email, phone, company, tags: [], notes,
      lastContacted: todayStr(), followUpNeeded: false,
      birthday: '', anniversary: '', followUpDate: '',
    }, lat, lng, locationLabel);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="rounded-xl border shadow-2xl w-96 p-6 flex flex-col gap-4"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Add Contact at Location</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        {locationLabel && (
          <div className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <MapPin size={10} /> {locationLabel}
          </div>
        )}
        <div>
          <div className="caesar-label">Name *</div>
          <input className="caesar-input" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="caesar-label">Email</div>
            <input className="caesar-input" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <div className="caesar-label">Phone</div>
            <input className="caesar-input" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="caesar-label">Company</div>
            <input className="caesar-input" value={company} onChange={e => setCompany(e.target.value)} />
          </div>
          <div>
            <div className="caesar-label">Relationship</div>
            <input className="caesar-input" value={relationship} onChange={e => setRelationship(e.target.value)} />
          </div>
        </div>
        <div>
          <div className="caesar-label">Notes</div>
          <textarea className="caesar-textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={save} className="caesar-btn-primary flex-1">Add to Map & CRM</button>
          <button onClick={onClose} className="caesar-btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── CONFIRM PLACE MODAL ──────────────────────────────────────────────────────

function ConfirmPlaceModal({
  contactName,
  locationLabel,
  onConfirm,
  onCancel,
}: {
  contactName: string;
  locationLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-xl border shadow-2xl w-80 p-5 flex flex-col gap-4"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          Place {contactName} here?
        </h2>
        {locationLabel && (
          <div className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <MapPin size={10} /> {locationLabel}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onConfirm} className="caesar-btn-primary flex-1">Confirm</button>
          <button onClick={onCancel} className="caesar-btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── GEOGRAPHIC VIEW ──────────────────────────────────────────────────────────

interface Props {
  contacts: Contact[];
  projects: Project[];
  mapState: NetworkingMapState;
  filteredIds: Set<string>;
  onUpdateMapData: (contactId: string, data: Partial<ContactMapData>) => void;
  onUpdateContact: (updated: Contact) => void;
  onAddContact: (contact: Contact, lat: number, lng: number, locationLabel: string) => void;
  onNavigateToCRM: () => void;
}

export function GeographicView({
  contacts,
  projects,
  mapState,
  filteredIds,
  onUpdateMapData,
  onUpdateContact,
  onAddContact,
  onNavigateToCRM,
}: Props) {
  const { isDark } = useTheme();
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [placingContactId, setPlacingContactId] = useState<string | null>(null);
  const [confirmPlace, setConfirmPlace] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ lat: number; lng: number; x: number; y: number } | null>(null);
  const [newContactPos, setNewContactPos] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDrop, setShowSearchDrop] = useState(false);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  const unplaced = getUnplacedContacts(contacts, mapState.contactData);

  const searchResults = searchQuery.trim()
    ? unplaced.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 6)
    : [];

  const handlePlace = useCallback(async (lat: number, lng: number) => {
    const label = await reverseGeocode(lat, lng);
    setConfirmPlace({ lat, lng, label });
  }, []);

  const handleConfirmPlace = useCallback(() => {
    if (!confirmPlace || !placingContactId) return;
    onUpdateMapData(placingContactId, {
      lat: confirmPlace.lat,
      lng: confirmPlace.lng,
      locationLabel: confirmPlace.label,
    });
    setPlacingContactId(null);
    setConfirmPlace(null);
    setSearchQuery('');
    setShowSearchDrop(false);
  }, [confirmPlace, placingContactId, onUpdateMapData]);

  const handleRightClick = useCallback(async (lat: number, lng: number, x: number, y: number) => {
    if (placingContactId) return; // don't show context menu while placing
    setContextMenu({ lat, lng, x, y });
  }, [placingContactId]);

  const openNewContactModal = async () => {
    if (!contextMenu) return;
    const label = await reverseGeocode(contextMenu.lat, contextMenu.lng);
    setNewContactPos({ lat: contextMenu.lat, lng: contextMenu.lng, label });
    setContextMenu(null);
  };

  const handleNewContactSave = (
    data: Omit<Contact, 'id' | 'interactions' | 'linkedProjects'>,
    lat: number,
    lng: number,
    locationLabel: string,
  ) => {
    const newContact: Contact = {
      ...data,
      id: generateId(),
      interactions: [],
      linkedProjects: [],
    };
    onAddContact(newContact, lat, lng, locationLabel);
    setNewContactPos(null);
  };

  const placedContacts = contacts.filter(c => {
    const d = mapState.contactData[c.id];
    return d && d.lat !== undefined && d.lng !== undefined;
  });

  const selectedContact = contacts.find(c => c.id === selectedContactId) ?? null;
  const selectedMapData = selectedContactId
    ? (mapState.contactData[selectedContactId] ?? defaultContactMapData(selectedContactId))
    : null;

  return (
    <div className="relative w-full h-full" style={{ cursor: placingContactId ? 'crosshair' : 'default' }}>
      {/* Placement mode banner */}
      {placingContactId && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] px-4 py-2 rounded-xl border shadow-lg text-sm font-medium flex items-center gap-2"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <MapPin size={14} style={{ color: '#d97706' }} />
          Click anywhere on the map to place {contacts.find(c => c.id === placingContactId)?.name}
          <button
            onClick={() => { setPlacingContactId(null); setConfirmPlace(null); }}
            className="ml-2 p-0.5 rounded"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="absolute top-3 left-3 z-[600] flex flex-col gap-1" style={{ width: 240 }}>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border shadow"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            className="flex-1 text-xs bg-transparent outline-none"
            style={{ color: 'var(--text-primary)' }}
            placeholder="Place a contact..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setShowSearchDrop(true); }}
            onFocus={() => setShowSearchDrop(true)}
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setShowSearchDrop(false); }}>
              <X size={12} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>
        {showSearchDrop && searchResults.length > 0 && (
          <div className="rounded-xl border shadow-xl overflow-hidden"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            {searchResults.map(c => (
              <button
                key={c.id}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-[var(--bg-hover)] transition-colors"
                style={{ color: 'var(--text-primary)' }}
                onClick={() => {
                  setPlacingContactId(c.id);
                  setShowSearchDrop(false);
                  setSearchQuery(c.name);
                }}
              >
                <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold"
                  style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                  {getContactInitials(c.name)}
                </div>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <MapContainer
        center={[39, -98]}
        zoom={4}
        style={{ width: '100%', height: '100%', zIndex: 0 }}
        zoomControl={false}
        className="rounded-xl overflow-hidden"
      >
        <TileLayer
          url={tileUrl}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />
        <ZoomControl position="bottomleft" />

        {/* Map event handlers */}
        <MapClickHandler placingContactId={placingContactId} onPlace={handlePlace} />
        <ContextMenuHandler onRightClick={handleRightClick} />

        {/* Reset view + Locate Me buttons */}
        <ResetViewButton />
        <LocateMeButton onLocated={(lat, lng) => setMyLocation({ lat, lng })} />

        {/* My location marker */}
        {myLocation && (
          <Marker
            position={[myLocation.lat, myLocation.lng]}
            icon={createMyLocationIcon()}
            zIndexOffset={1000}
          />
        )}

        {/* Contact pins */}
        <MarkerClusterGroup chunkedLoading>
          {placedContacts.map(c => {
            const d = mapState.contactData[c.id] ?? defaultContactMapData(c.id);
            if (d.lat === undefined || d.lng === undefined) return null;
            const dimmed = filteredIds.size > 0 && !filteredIds.has(c.id);
            return (
              <Marker
                key={c.id}
                position={[d.lat!, d.lng!]}
                icon={createPinIcon(c, d, dimmed)}
                draggable
                eventHandlers={{
                  click: () => setSelectedContactId(c.id === selectedContactId ? null : c.id),
                  dragend: async (e) => {
                    const { lat, lng } = (e.target as L.Marker).getLatLng();
                    const label = await reverseGeocode(lat, lng);
                    onUpdateMapData(c.id, { lat, lng, locationLabel: label });
                  },
                }}
              >
                <Popup
                  closeButton={false}
                  className="leaflet-popup-no-padding"
                  offset={[0, -8]}
                >
                  <ContactMapPopup
                    contact={c}
                    mapData={d}
                    onClose={() => setSelectedContactId(null)}
                    onUpdateMapData={data => onUpdateMapData(c.id, data)}
                    onUpdateContact={onUpdateContact}
                    onEditInCRM={onNavigateToCRM}
                  />
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>

      {/* Right-click context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[700]" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-[800] rounded-xl border shadow-xl overflow-hidden"
            style={{ top: contextMenu.y, left: contextMenu.x, backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <button
              onClick={openNewContactModal}
              className="flex items-center gap-2 px-4 py-2.5 text-xs w-full text-left hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: 'var(--text-primary)' }}
            >
              <Plus size={12} /> Add New Contact Here
            </button>
          </div>
        </>
      )}

      {/* Confirm place modal */}
      {confirmPlace && placingContactId && (
        <ConfirmPlaceModal
          contactName={contacts.find(c => c.id === placingContactId)?.name ?? ''}
          locationLabel={confirmPlace.label}
          onConfirm={handleConfirmPlace}
          onCancel={() => { setConfirmPlace(null); setPlacingContactId(null); setSearchQuery(''); setShowSearchDrop(false); }}
        />
      )}

      {/* New contact modal */}
      {newContactPos && (
        <NewContactModal
          lat={newContactPos.lat}
          lng={newContactPos.lng}
          locationLabel={newContactPos.label}
          onSave={handleNewContactSave}
          onClose={() => setNewContactPos(null)}
        />
      )}

      {/* Leaflet popup CSS fix */}
      <style>{`
        .leaflet-popup-content-wrapper { background: transparent !important; padding: 0 !important; box-shadow: none !important; border: none !important; }
        .leaflet-popup-content { margin: 0 !important; }
        .leaflet-popup-tip-container { display: none !important; }
        .leaflet-container { font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important; }
        .marker-cluster { background-clip: padding-box; border-radius: 50%; background: var(--bg-card); border: 2px solid var(--border-strong); }
        .marker-cluster div { width: 30px; height: 30px; margin: 5px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: var(--text-primary); background: var(--bg-elevated); }
        .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large { background-color: var(--bg-elevated); }
      `}</style>
    </div>
  );
}
