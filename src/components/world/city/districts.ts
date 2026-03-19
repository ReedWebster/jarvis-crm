/**
 * District & zone definitions — the data that maps grid positions to named districts.
 */
import type { DistrictDef, ZoneType } from '../types';
import { HALF } from '../types';

// ─── District Registry ───────────────────────────────────────────────────────

export const DISTRICTS: Record<string, DistrictDef> = {
  'financial-core':    { name: 'Financial Core',    zone: 'downtown', color: '#C8C4BC' },
  'central-tower':     { name: 'Central Tower',     zone: 'downtown', color: '#C4C0B8' },
  'capital-row':       { name: 'Capital Row',       zone: 'downtown', color: '#C6C2BA' },
  'commerce-plaza':    { name: 'Commerce Plaza',    zone: 'downtown', color: '#CAC6BE' },
  'exchange-sq':       { name: 'Exchange Square',   zone: 'downtown', color: '#C8C4BC' },
  'skyline-block':     { name: 'Skyline Block',     zone: 'downtown', color: '#C2BEB6' },
  'civic-hub':         { name: 'Civic Hub',         zone: 'downtown', color: '#C8C4BC' },
  'crown-heights':     { name: 'Crown Heights',     zone: 'downtown', color: '#C4C0B8' },
  'moat-shield':       { name: 'Moat & Shield AI',  zone: 'downtown', color: '#BCC4CC',
                         palette: [{ main: '#0C1E3A', alt: '#1A3050', trim: '#40B0FF' }] },
  'midtown-west':      { name: 'Midtown West',      zone: 'midrise',  color: '#CCCCBC' },
  'uptown-east':       { name: 'Uptown East',       zone: 'midrise',  color: '#CCC8BC' },
  'park-ave':          { name: 'Park Avenue',       zone: 'midrise',  color: '#C8CCBC' },
  'gallery-row':       { name: 'Gallery Row',       zone: 'midrise',  color: '#D0CCB8',
                         palette: [{ main: '#E8DCC8', alt: '#D8CCB0', trim: '#B8A888' }] },
  'the-arcade':        { name: 'The Arcade',        zone: 'midrise',  color: '#CCCCBC' },
  'merchant-row':      { name: 'Merchant Row',      zone: 'midrise',  color: '#CCC8B8' },
  'harbor-gate':       { name: 'Harbor Gate',       zone: 'midrise',  color: '#C0C8D0' },
  'river-bend':        { name: 'River Bend',        zone: 'midrise',  color: '#C4CCC8' },
  'lakeside':          { name: 'Lakeside',          zone: 'midrise',  color: '#C8D0CC' },
  'arts-quarter':      { name: 'Arts Quarter',      zone: 'mixed',    color: '#D0C8B4',
                         palette: [{ main: '#D8C4A8', alt: '#C8B898', trim: '#E0D4BC' }] },
  'innovation-mile':   { name: 'Innovation Mile',   zone: 'mixed',    color: '#C8C0A8',
                         palette: [{ main: '#E0E8EC', alt: '#C8D8E0', trim: '#A8C0D0' }] },
  'market-street':     { name: 'Market Street',     zone: 'mixed',    color: '#CCC4AC' },
  'craft-district':    { name: 'Craft District',    zone: 'mixed',    color: '#D0C8B0' },
  'bricktown':         { name: 'Bricktown',         zone: 'mixed',    color: '#D4C0A8',
                         palette: [{ main: '#B87850', alt: '#A06840', trim: '#C8A080' }] },
  'the-yards':         { name: 'The Yards',         zone: 'mixed',    color: '#C8C0A8' },
  'riverside':         { name: 'Riverside',         zone: 'mixed',    color: '#C8CCC0' },
  'garden-block':      { name: 'Garden Block',      zone: 'mixed',    color: '#C8D0BC' },
  'university-row':    { name: 'University Row',    zone: 'mixed',    color: '#C8C4B0' },
  'oak-st':            { name: 'Oak Street',        zone: 'low',      color: '#D0C8B4' },
  'maple-ave':         { name: 'Maple Avenue',      zone: 'low',      color: '#D4CCB8' },
  'pine-court':        { name: 'Pine Court',        zone: 'low',      color: '#CCC8B4' },
  'birch-lane':        { name: 'Birch Lane',        zone: 'low',      color: '#D0CCB8' },
  'cedar-row':         { name: 'Cedar Row',         zone: 'low',      color: '#D4D0BC' },
  'elm-park':          { name: 'Elm Park',          zone: 'low',      color: '#CCC8B0' },
  'chestnut-way':      { name: 'Chestnut Way',      zone: 'low',      color: '#D0C8B4' },
  'aspen-hill':        { name: 'Aspen Hill',        zone: 'low',      color: '#D4D0BC' },
  'valley-view':       { name: 'Valley View',       zone: 'low',      color: '#D0CCB8' },
  'byu-campus':        { name: 'BYU Campus',        zone: 'midrise',  color: '#2A5C30' },
  'city-park':         { name: 'City Park',         zone: 'park',     color: '#C8D8C0' },
  'memorial-green':    { name: 'Memorial Green',    zone: 'park',     color: '#C8D8C0' },
  'botanical-garden':  { name: 'Botanical Garden',  zone: 'park',     color: '#C8D8C0' },
  'riverside-park':    { name: 'Riverside Park',    zone: 'park',     color: '#C8D8C0' },
  'central-commons':   { name: 'Central Commons',   zone: 'park',     color: '#C8D8C0' },
  'harbor':            { name: 'Harbor',            zone: 'water',    color: '#406080' },
  'bay-front':         { name: 'Bay Front',         zone: 'water',    color: '#406080' },
  'marina':            { name: 'Marina',            zone: 'water',    color: '#406080' },
};

const DEFAULT_DISTRICT: DistrictDef = { name: 'Suburbs', zone: 'low', color: '#D0C8B4' };

// ─── Block → District Mapping ────────────────────────────────────────────────

export const BLOCK_DISTRICT: Record<string, string> = {
  // Downtown core
  '0,0': 'financial-core', '1,0': 'central-tower', '0,1': 'commerce-plaza',
  '0,-1': 'exchange-sq', '-1,0': 'moat-shield', '1,1': 'byu-campus',
  '-1,1': 'capital-row', '1,-1': 'skyline-block', '-1,-1': 'civic-hub',
  '2,0': 'crown-heights', '0,2': 'capital-row', '-2,0': 'commerce-plaza',
  '0,-2': 'exchange-sq', '2,1': 'skyline-block', '-2,1': 'civic-hub',
  '2,-1': 'central-tower', '-2,-1': 'financial-core',
  // Midrise ring
  '2,2': 'midtown-west', '-2,2': 'uptown-east', '3,0': 'park-ave',
  '-3,0': 'gallery-row', '3,1': 'the-arcade', '-3,-1': 'merchant-row',
  '3,-1': 'harbor-gate', '-3,1': 'central-commons', '3,-2': 'river-bend',
  '-3,-2': 'lakeside', '2,-2': 'city-park', '3,-3': 'memorial-green',
  '-2,-2': 'midtown-west', '1,2': 'uptown-east', '-1,2': 'park-ave',
  '1,-2': 'the-arcade', '2,-3': 'botanical-garden', '3,-4': 'riverside-park',
  '2,3': 'harbor-gate', '-2,3': 'river-bend',
  '3,2': 'lakeside', '-3,2': 'merchant-row', '3,3': 'the-arcade',
  '-3,3': 'park-ave',
  // Mixed ring
  '4,0': 'arts-quarter', '-4,0': 'innovation-mile', '4,1': 'market-street',
  '-4,1': 'craft-district', '4,-1': 'bricktown', '-4,-1': 'the-yards',
  '4,2': 'riverside', '-4,2': 'garden-block', '4,-2': 'university-row',
  '-4,-2': 'arts-quarter', '0,4': 'innovation-mile', '0,-4': 'market-street',
  '1,4': 'craft-district', '-1,4': 'bricktown', '1,-4': 'the-yards',
  '-1,-4': 'riverside', '2,4': 'garden-block', '-2,4': 'university-row',
  '1,3': 'arts-quarter', '-1,3': 'market-street', '3,4': 'craft-district',
  '-3,4': 'riverside', '4,3': 'bricktown', '-4,3': 'garden-block',
  '4,-3': 'the-yards', '-4,-3': 'university-row', '-1,-3': 'innovation-mile',
  '1,-3': 'arts-quarter', '-2,-3': 'market-street', '2,-4': 'craft-district',
  '-2,-4': 'the-yards',
  // Water row
  '-3,-6': 'harbor', '-4,-6': 'harbor', '-5,-6': 'harbor', '-6,-6': 'harbor',
  '3,-6': 'bay-front', '4,-6': 'bay-front', '5,-6': 'bay-front', '6,-6': 'bay-front',
  '-2,-6': 'marina', '-1,-6': 'marina', '0,-6': 'marina', '1,-6': 'marina', '2,-6': 'marina',
  '-3,-5': 'harbor', '3,-5': 'bay-front', '4,-5': 'bay-front', '5,-5': 'bay-front', '6,-5': 'bay-front',
  '-4,-5': 'harbor', '-5,-5': 'harbor', '-6,-5': 'harbor',
};

// ─── Zone Label Pools ────────────────────────────────────────────────────────

export const ZONE_LABELS: Record<ZoneType, string[]> = {
  downtown: ['Financial Core', 'Central Tower', 'Commerce Plaza', 'Exchange Sq', 'Skyline Block', 'Capital Row', 'Civic Hub', 'Crown Heights'],
  midrise: ['Midtown West', 'Uptown East', 'Park Ave', 'Gallery Row', 'The Arcade', 'Merchant Row', 'Harbor Gate', 'River Bend', 'Lakeside'],
  mixed: ['Arts Quarter', 'University Row', 'Market Street', 'Innovation Mile', 'Craft District', 'Bricktown', 'The Yards', 'Riverside', 'Garden Block'],
  low: ['Oak St', 'Maple Ave', 'Pine Court', 'Birch Lane', 'Cedar Row', 'Elm Park', 'Chestnut Way', 'Aspen Hill', 'Valley View'],
  park: ['City Park', 'Memorial Green', 'Botanical Garden', 'Riverside Park', 'Central Commons'],
  water: ['Harbor', 'Bay Front', 'Marina', 'River District'],
};

// ─── Lookup Functions ────────────────────────────────────────────────────────

export function getDistrict(col: number, row: number): DistrictDef {
  const key = `${col},${row}`;
  const id = BLOCK_DISTRICT[key];
  if (id && DISTRICTS[id]) return DISTRICTS[id];
  return DEFAULT_DISTRICT;
}

export function getZone(col: number, row: number): ZoneType {
  const key = `${col},${row}`;
  const id = BLOCK_DISTRICT[key];
  if (id && DISTRICTS[id]) return DISTRICTS[id].zone;
  const dist = Math.sqrt(col * col + row * row);
  if (
    (col === 2 && row === -2) || (col === 3 && row === -2) ||
    (col === 2 && row === -3) || (col === 3 && row === -3) ||
    (col === -3 && row === 1)
  ) return 'park';
  if (row === -HALF || (row === -HALF + 1 && Math.abs(col) >= 3)) return 'water';
  if (dist <= 2.0) return 'downtown';
  if (dist <= 3.5) return 'midrise';
  if (dist <= 4.8) return 'mixed';
  return 'low';
}

export function getDistrictLabel(col: number, row: number): string {
  const key = `${col},${row}`;
  const id = BLOCK_DISTRICT[key];
  if (id && DISTRICTS[id]) return DISTRICTS[id].name;
  const zone = getZone(col, row);
  const labels = ZONE_LABELS[zone];
  const idx = Math.abs((col * 7 + row * 13) % labels.length);
  return labels[idx];
}
