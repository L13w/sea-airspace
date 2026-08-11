import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Map, { Source, Layer, useControl } from 'react-map-gl/maplibre';
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { GeoJsonLayer } from '@deck.gl/layers';
import { useAirspaceData } from '../hooks/useAirspaceData';
import { useIsMobile, useIsTouchDevice, useIsMobileLandscape } from '../hooks/useIsMobile';
import type { TerminalArea } from '../config/terminalAreas';
import { InfoPanel } from './InfoPanel';
import { Legend } from './Legend';
import { AirspaceProfile } from './AirspaceProfile';
import { AltitudeScale } from './AltitudeScale';
import { BrowserNotice } from './BrowserNotice';
import { IOSNotice } from './IOSNotice';
import { TerminalAreaSelector } from './TerminalAreaSelector';
import { MobileMenu } from './MobileMenu';
import { formatAltitude } from '../utils/altitudeUtils';
import { getOutlineColor, HIGHLIGHT_COLORS } from '../utils/colorUtils';
import type { ProcessedAirspace } from '../types/airspace';
import 'maplibre-gl/dist/maplibre-gl.css';

// deck.gl v8 has no TS types (see src/deck-gl.d.ts). Use `any` for its API surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapboxOverlayProps = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PickingInfo = any;

// deck.gl fails to draw on iOS WebKit (canvas is present + sized but no fragments
// reach the compositor). MapLibre's native fill-extrusion renders fine there since
// it's the same engine that already draws the sectional raster. Split at runtime
// so desktop keeps deck.gl's richer 3D look (Phong shading + wireframe outlines)
// and iOS gets a version that actually renders.
// (iPad on iOS 13+ reports platform "MacIntel", so also check touchpoint hint.)
const IS_IOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

// Get initial view for a terminal area
function getInitialView(area: TerminalArea) {
  return {
    longitude: area.centerLng,
    latitude: area.centerLat,
    zoom: 8.5,
    pitch: 55,
    bearing: -20,
  };
}

// Vertical exaggeration factor - makes altitude differences visible
const ALTITUDE_EXAGGERATION = 16.7;

const AIRSPACE_SOURCE_ID = 'airspace-source';
const AIRSPACE_FILL_LAYER_ID = 'airspace-fill-extrusion';
const AIRSPACE_OUTLINE_LAYER_ID = 'airspace-outline-ground';

// deck.gl overlay component using react-map-gl's useControl hook (desktop path).
function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

interface HoverInfo {
  x: number;
  y: number;
  object: ProcessedAirspace;
}

interface Map3DProps {
  terminalArea: TerminalArea;
}

export function Map3D({ terminalArea }: Map3DProps) {
  const { data, loading, error } = useAirspaceData(terminalArea);
  const [selectedAirspace, setSelectedAirspace] = useState<ProcessedAirspace | null>(null);
  const [hoveredAirspace, setHoveredAirspace] = useState<ProcessedAirspace | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [showClassE, setShowClassE] = useState(false);
  const [showHelpOverlay, setShowHelpOverlay] = useState(true);
  const [viewState, setViewState] = useState(getInitialView(terminalArea));

  // Responsive hooks
  const isMobile = useIsMobile();
  const isTouch = useIsTouchDevice();
  const isMobileLandscape = useIsMobileLandscape();

  // Reset view when terminal area changes
  useEffect(() => {
    setViewState(getInitialView(terminalArea));
    setSelectedAirspace(null);
    setHoveredAirspace(null);
  }, [terminalArea]);

  const mapRef = useRef<MapRef | null>(null);
  const prevSelectedIdRef = useRef<number | null>(null);
  const prevHoveredIdRef = useRef<number | null>(null);

  // deck.gl path: track whether deck.gl's onClick fired so the map-level onClick
  // knows not to clear the selection (event order: deck first, then map).
  const deckClickHandled = useRef(false);

  const handleDeckClick = useCallback((info: PickingInfo) => {
    deckClickHandled.current = true;
    if (info.object) {
      setSelectedAirspace(info.object as ProcessedAirspace);
    }
  }, []);

  const handleDeckMapClick = useCallback(() => {
    if (!deckClickHandled.current) {
      setSelectedAirspace(null);
    }
    deckClickHandled.current = false;
  }, []);

  const handleDeckHover = useCallback((info: PickingInfo) => {
    if (info.object) {
      const obj = info.object as ProcessedAirspace;
      setHoveredAirspace(obj);
      setHoverInfo({ x: info.x, y: info.y, object: obj });
    } else {
      setHoveredAirspace(null);
      setHoverInfo(null);
    }
  }, []);

  const handleProfileClick = useCallback((airspace: ProcessedAirspace) => {
    setSelectedAirspace(airspace);
  }, []);

  const handleProfileHover = useCallback((airspace: ProcessedAirspace | null) => {
    setHoveredAirspace(airspace);
  }, []);

  // Sort airspaces by altitude for proper rendering order (lower floors first = rendered first = behind)
  // Filter out Class E unless showClassE is enabled
  const sortedData = useMemo(() => {
    if (!data) return [];
    const filtered = showClassE ? data : data.filter(d => d.properties.CLASS !== 'E');
    return [...filtered].sort((a, b) => a.floorMeters - b.floorMeters);
  }, [data, showClassE]);

  // Feature lookup by OBJECTID (for picking-event → ProcessedAirspace round-trip).
  const airspaceById = useMemo(() => {
    const lookup = new window.Map<number, ProcessedAirspace>();
    for (const d of sortedData) lookup.set(d.properties.OBJECTID, d);
    return lookup;
  }, [sortedData]);

  // Flatten to a plain GeoJSON FeatureCollection whose properties MapLibre expressions
  // can read directly. floorMeters/ceilingMeters drive fill-extrusion-base/height
  // (both are absolute altitudes in map units — MapLibre ignores geometry Z for
  // fill-extrusion, so the floor MUST come from a paint property).
  const airspaceGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: sortedData.map(f => ({
      type: 'Feature' as const,
      id: f.properties.OBJECTID,
      geometry: f.geometry,
      properties: {
        objectId: f.properties.OBJECTID,
        airspaceClass: f.properties.CLASS,
        floorMeters: f.floorMeters,
        ceilingMeters: f.ceilingMeters,
      },
    })),
  }), [sortedData]);

  // Paint expressions — per-class color/opacity baked into rgba strings so a single
  // fill-extrusion layer covers every class (fill-extrusion-opacity is layer-scope only).
  //
  // Note: these RGBs are punchier than the shared AIRSPACE_COLORS palette used by
  // deck.gl on desktop. deck.gl compensates with Phong lighting; MapLibre has no
  // real lighting on fill-extrusion, so flat pastel colors read as muted mush and
  // the classes bleed into each other. Boosted saturation gives them back their
  // hue identity at the same low opacity.
  const fillColorExpression = useMemo(() => ([
    'case',
    ['boolean', ['feature-state', 'selected'], false], 'rgba(255, 255, 100, 0.78)',
    ['boolean', ['feature-state', 'hover'], false], 'rgba(255, 200, 50, 0.70)',
    [
      'match',
      ['get', 'airspaceClass'],
      'B', 'rgba(50, 140, 255, 0.55)',    // vivid blue
      'C', 'rgba(200, 80, 255, 0.50)',    // vivid magenta/purple
      'D', 'rgba(30, 230, 255, 0.45)',    // vivid cyan
      'E', 'rgba(255, 120, 210, 0.35)',   // vivid pink
      'P', 'rgba(255, 60, 60, 0.45)',     // vivid red
      'R', 'rgba(255, 140, 40, 0.45)',    // vivid orange
      'rgba(160, 160, 160, 0.35)',
    ],
  ] as unknown as never), []);

  const outlineColorExpression = useMemo(() => ([
    'case',
    ['boolean', ['feature-state', 'selected'], false], '#ffc832',
    ['boolean', ['feature-state', 'hover'], false], '#ffe696',
    [
      'match',
      ['get', 'airspaceClass'],
      'B', '#3b82f6',
      'C', '#a855f7',
      'D', '#22d3ee',
      'E', '#f472b6',
      'P', '#ef4444',
      'R', '#f97316',
      '#808080',
    ],
  ] as unknown as never), []);

  const outlineWidthExpression = useMemo(() => ([
    'case',
    ['boolean', ['feature-state', 'selected'], false], 3,
    ['boolean', ['feature-state', 'hover'], false], 2,
    1,
  ] as unknown as never), []);

  // fill-extrusion-height is the ABSOLUTE top altitude in map units (not delta).
  // Ditto fill-extrusion-base for the floor. Multiply both by the same exaggeration
  // used in the deck.gl path so shelf heights match visually across renderers.
  const heightExpression = useMemo(() => ([
    '*', ['get', 'ceilingMeters'], ALTITUDE_EXAGGERATION,
  ] as unknown as never), []);

  const baseExpression = useMemo(() => ([
    '*', ['get', 'floorMeters'], ALTITUDE_EXAGGERATION,
  ] as unknown as never), []);

  // deck.gl layers (desktop path). Built only when we're not on iOS to avoid
  // constructing large GeoJsonLayers we won't use.
  const deckLayers = useMemo(() => {
    if (IS_IOS || !sortedData.length) return [];

    const selectedId = selectedAirspace?.properties.OBJECTID;
    const hoveredId = hoveredAirspace?.properties.OBJECTID;

    const fillLayer = new GeoJsonLayer({
      id: 'airspace-fill-layer',
      data: { type: 'FeatureCollection', features: sortedData },
      pickable: true,
      stroked: false,
      filled: true,
      extruded: true,
      wireframe: false,
      getElevation: (d: ProcessedAirspace) => d.extrusionHeight * ALTITUDE_EXAGGERATION,
      elevationScale: 1,
      getFillColor: (d: ProcessedAirspace) => {
        const isSelected = d.properties.OBJECTID === selectedId;
        const isHovered = d.properties.OBJECTID === hoveredId;
        if (isSelected) return HIGHLIGHT_COLORS.selected;
        if (isHovered) return HIGHLIGHT_COLORS.hover;
        const baseColor = d.color;
        const classOpacity: Record<string, number> = { B: 100, C: 80, D: 70, E: 50 };
        const opacity = classOpacity[d.properties.CLASS] || 60;
        return [baseColor[0], baseColor[1], baseColor[2], opacity] as [number, number, number, number];
      },
      material: {
        ambient: 0.6,
        diffuse: 0.8,
        shininess: 32,
        specularColor: [60, 64, 70],
      },
      onClick: handleDeckClick,
      onHover: handleDeckHover,
      autoHighlight: false,
      updateTriggers: {
        getFillColor: [selectedId, hoveredId],
      },
    });

    const outlineLayer = new GeoJsonLayer({
      id: 'airspace-outline-layer',
      data: { type: 'FeatureCollection', features: sortedData },
      pickable: false,
      stroked: true,
      filled: false,
      extruded: true,
      wireframe: true,
      getElevation: (d: ProcessedAirspace) => d.extrusionHeight * ALTITUDE_EXAGGERATION,
      elevationScale: 1,
      getLineColor: (d: ProcessedAirspace) => {
        const isSelected = d.properties.OBJECTID === selectedId;
        const isHovered = d.properties.OBJECTID === hoveredId;
        if (isSelected) return [255, 200, 50, 255] as [number, number, number, number];
        if (isHovered) return [255, 230, 150, 255] as [number, number, number, number];
        return getOutlineColor(d.properties.CLASS);
      },
      lineWidthMinPixels: 1,
      getLineWidth: (d: ProcessedAirspace) => {
        const isSelected = d.properties.OBJECTID === selectedId;
        const isHovered = d.properties.OBJECTID === hoveredId;
        return isSelected ? 80 : isHovered ? 60 : 30;
      },
      updateTriggers: {
        getLineColor: [selectedId, hoveredId],
        getLineWidth: [selectedId, hoveredId],
      },
    });

    return [fillLayer, outlineLayer];
  }, [sortedData, selectedAirspace, hoveredAirspace, handleDeckClick, handleDeckHover]);

  // Sync selection → MapLibre feature-state (drives fill/outline color via expressions).
  // iOS path only; on desktop the deck.gl layers handle highlighting themselves.
  useEffect(() => {
    if (!IS_IOS) return;
    const map = mapRef.current?.getMap();
    if (!map || !map.getSource(AIRSPACE_SOURCE_ID)) return;
    const newId = selectedAirspace?.properties.OBJECTID ?? null;
    const oldId = prevSelectedIdRef.current;
    if (oldId !== null && oldId !== newId) {
      map.setFeatureState({ source: AIRSPACE_SOURCE_ID, id: oldId }, { selected: false });
    }
    if (newId !== null) {
      map.setFeatureState({ source: AIRSPACE_SOURCE_ID, id: newId }, { selected: true });
    }
    prevSelectedIdRef.current = newId;
  }, [selectedAirspace, airspaceGeoJSON]);

  // Sync hover → feature-state, same pattern (iOS path only).
  useEffect(() => {
    if (!IS_IOS) return;
    const map = mapRef.current?.getMap();
    if (!map || !map.getSource(AIRSPACE_SOURCE_ID)) return;
    const newId = hoveredAirspace?.properties.OBJECTID ?? null;
    const oldId = prevHoveredIdRef.current;
    if (oldId !== null && oldId !== newId) {
      map.setFeatureState({ source: AIRSPACE_SOURCE_ID, id: oldId }, { hover: false });
    }
    if (newId !== null) {
      map.setFeatureState({ source: AIRSPACE_SOURCE_ID, id: newId }, { hover: true });
    }
    prevHoveredIdRef.current = newId;
  }, [hoveredAirspace, airspaceGeoJSON]);

  const handleMapClick = useCallback((e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (feature && feature.properties) {
      const id = feature.properties.objectId as number;
      const airspace = airspaceById.get(id);
      if (airspace) {
        setSelectedAirspace(airspace);
        return;
      }
    }
    setSelectedAirspace(null);
  }, [airspaceById]);

  const handleMapMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (feature && feature.properties) {
      const id = feature.properties.objectId as number;
      const airspace = airspaceById.get(id);
      if (airspace) {
        setHoveredAirspace(airspace);
        setHoverInfo({ x: e.point.x, y: e.point.y, object: airspace });
        return;
      }
    }
    setHoveredAirspace(null);
    setHoverInfo(null);
  }, [airspaceById]);

  // Create map style with the appropriate sectional chart for this terminal area
  const mapStyle = useMemo(() => ({
    version: 8 as const,
    sources: {
      'sectional': {
        type: 'raster' as const,
        tiles: [
          'https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        attribution: 'FAA Aeronautical Charts'
      }
    },
    layers: [
      {
        id: 'sectional-layer',
        type: 'raster' as const,
        source: 'sectional',
        minzoom: 0,
        maxzoom: 12
      }
    ]
  }), []);

  // Responsive layout: hide profile and altitude scale on mobile (portrait or landscape)
  const showProfile = !isMobile && !isMobileLandscape;
  const showAltitudeScale = !isMobile && !isMobileLandscape;
  const show3D = true;

  // Combine mobile states for simpler conditionals
  const isMobileAny = isMobile || isMobileLandscape;

  return (
    <div style={{ width: '100vw', height: '100dvh', position: 'relative', background: 'var(--bg-primary)' }}>
      {/* Map container — desktop (deck.gl) vs iOS (MapLibre native fill-extrusion) */}
      {show3D && !IS_IOS && (
        <Map
          {...viewState}
          onMove={(evt: { viewState: typeof viewState }) => setViewState(evt.viewState)}
          onClick={handleDeckMapClick}
          maxPitch={85}
          minPitch={0}
          mapStyle={mapStyle}
        >
          <DeckGLOverlay layers={deckLayers} interleaved />
        </Map>
      )}
      {show3D && IS_IOS && (
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt: { viewState: typeof viewState }) => setViewState(evt.viewState)}
          onClick={handleMapClick}
          onMouseMove={handleMapMouseMove}
          interactiveLayerIds={[AIRSPACE_FILL_LAYER_ID]}
          cursor={hoveredAirspace ? 'pointer' : ''}
          maxPitch={85}
          minPitch={0}
          mapStyle={mapStyle}
        >
          {sortedData.length > 0 && (
            <Source
              id={AIRSPACE_SOURCE_ID}
              type="geojson"
              data={airspaceGeoJSON}
              promoteId="objectId"
            >
              <Layer
                id={AIRSPACE_FILL_LAYER_ID}
                type="fill-extrusion"
                paint={{
                  'fill-extrusion-color': fillColorExpression,
                  'fill-extrusion-height': heightExpression,
                  'fill-extrusion-base': baseExpression,
                  // Opacity now baked per-class into the rgba strings; keep layer
                  // multiplier at 1 so those alphas are the final value.
                  'fill-extrusion-opacity': 1,
                  // Vertical gradient darkens wall bottoms and washes out hue —
                  // disabling it keeps the classes visually distinct.
                  'fill-extrusion-vertical-gradient': false,
                }}
              />
              <Layer
                id={AIRSPACE_OUTLINE_LAYER_ID}
                type="line"
                paint={{
                  'line-color': outlineColorExpression,
                  'line-width': outlineWidthExpression,
                  'line-opacity': 0.7,
                }}
              />
            </Source>
          )}
        </Map>
      )}

      {/* Terminal Area Selector - upper left */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 100,
        }}
      >
        <TerminalAreaSelector selectedArea={terminalArea} />
      </div>

      {/* Title - compact dark box, centered (hidden on mobile and narrow screens to prevent overlap) */}
      {!isMobileAny && (
        <div
          className="desktop-title"
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(8px)',
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            zIndex: 100,
          }}
        >
          <style>{`
            @media (max-width: 1100px) {
              .desktop-title {
                display: none !important;
              }
            }
          `}</style>
          <h1
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#f8fafc',
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            {terminalArea.name} Airspace
          </h1>
          <p
            className="mono"
            style={{
              fontSize: '10px',
              color: 'rgba(148, 163, 184, 0.9)',
              marginTop: '2px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {terminalArea.id} • 3D Visualization
          </p>
        </div>
      )}

      {/* Hover tooltip - hidden on mobile when airspace is selected */}
      {hoverInfo && show3D && !(isMobileAny && selectedAirspace) && (
        <div
          className="glass-panel animate-fade-in"
          style={{
            position: 'absolute',
            left: hoverInfo.x + 12,
            top: hoverInfo.y + 12,
            padding: '10px 14px',
            pointerEvents: 'none',
            zIndex: 1000,
            maxWidth: '280px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '6px',
            }}
          >
            <div className={`class-badge ${hoverInfo.object.properties.CLASS}`}>
              {hoverInfo.object.properties.CLASS}
            </div>
            <strong
              style={{
                fontSize: '14px',
                color: '#ffffff',
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
              }}
            >
              {hoverInfo.object.properties.NAME}
            </strong>
          </div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#e2e8f0',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {formatAltitude(hoverInfo.object.properties.LOWER_VAL, hoverInfo.object.properties.LOWER_CODE)}
            {' → '}
            {formatAltitude(hoverInfo.object.properties.UPPER_VAL, hoverInfo.object.properties.UPPER_CODE)}
          </div>
        </div>
      )}

      {/* Right-side panel: Action buttons + Profile view - horizontally aligned */}
      {showProfile && data && (
        <div
          style={{
            position: 'absolute',
            right: 16,
            top: 16,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: '12px',
            zIndex: 100,
          }}
        >
          {/* Action buttons - horizontal row */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '8px',
              paddingTop: '2px',
            }}
          >
            <button
              onClick={() => setShowHelpOverlay(true)}
              className="glass-panel"
              style={{
                padding: '8px 14px',
                fontSize: '11px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'var(--bg-glass)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.background = 'var(--bg-glass)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              Help
            </button>
            <a
              href="https://github.com/L13w/airspace"
              target="_blank"
              rel="noopener noreferrer"
              className="glass-panel"
              style={{
                padding: '8px 14px',
                fontSize: '11px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'var(--bg-glass)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                cursor: 'pointer',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.currentTarget.style.background = 'var(--bg-glass)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              Code & Docs
            </a>
          </div>

          {/* Profile view - inline */}
          <AirspaceProfile
            key={`profile-${terminalArea.id}`}
            airspaces={data}
            selectedAirspace={selectedAirspace}
            hoveredAirspace={hoveredAirspace}
            onAirspaceClick={handleProfileClick}
            onAirspaceHover={handleProfileHover}
            airportCode={terminalArea.id}
          />
        </div>
      )}

      {/* Mobile-only hamburger menu - top right */}
      {isMobileAny && (
        <MobileMenu onShowHelp={() => setShowHelpOverlay(true)} />
      )}

      {/* Altitude scale - hidden on mobile */}
      {showAltitudeScale && data && (
        <AltitudeScale
          key={`scale-${terminalArea.id}`}
          airspaces={data}
          selectedAirspace={selectedAirspace}
          hoveredAirspace={hoveredAirspace}
        />
      )}

      {/* Side panel for selected airspace */}
      <InfoPanel
        airspace={selectedAirspace}
        onClose={() => setSelectedAirspace(null)}
      />

      {/* Legend - hidden on mobile */}
      {show3D && (
        <Legend
          compact={isMobileAny || !!selectedAirspace}
          showClassE={showClassE}
          onShowClassEChange={isMobileAny ? undefined : setShowClassE}
        />
      )}

      {/* Loading overlay */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--bg-glass)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid var(--border-subtle)',
              borderTopColor: 'var(--class-b)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '16px',
            }}
          />
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
          <span
            style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
            }}
          >
            Loading airspace data...
          </span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '24px 32px',
            textAlign: 'center',
            zIndex: 2000,
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <span style={{ fontSize: '24px', color: 'var(--accent-red)' }}>!</span>
          </div>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              marginBottom: '8px',
            }}
          >
            Failed to load airspace
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}
          >
            {error.message}
          </div>
        </div>
      )}

      {/* Help overlay - responsive for touch/mouse */}
      {showHelpOverlay && !loading && (
        <div
          onClick={() => setShowHelpOverlay(false)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            cursor: 'pointer',
            padding: isMobileAny ? '1rem' : 0,
          }}
        >
          {/* Touch gestures for mobile */}
          {isTouch ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1.5rem',
              padding: '0 1rem',
              maxWidth: '320px',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: isMobileAny ? '1.5rem' : '2rem',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.9)',
                  textShadow: '0 2px 12px rgba(0, 0, 0, 0.6)',
                  marginBottom: '0.25rem',
                }}>
                  ☝️ One Finger
                </div>
                <div style={{
                  fontSize: isMobileAny ? '1rem' : '1.25rem',
                  color: 'rgba(255, 255, 255, 0.7)',
                }}>
                  Pan the map
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: isMobileAny ? '1.5rem' : '2rem',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.9)',
                  textShadow: '0 2px 12px rgba(0, 0, 0, 0.6)',
                  marginBottom: '0.25rem',
                }}>
                  ✌️ Two Fingers
                </div>
                <div style={{
                  fontSize: isMobileAny ? '1rem' : '1.25rem',
                  color: 'rgba(255, 255, 255, 0.7)',
                }}>
                  Pinch to zoom, drag up/down to tilt,
                  <br />
                  twist to rotate
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: isMobileAny ? '1.5rem' : '2rem',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.9)',
                  textShadow: '0 2px 12px rgba(0, 0, 0, 0.6)',
                  marginBottom: '0.25rem',
                }}>
                  👆 Tap
                </div>
                <div style={{
                  fontSize: isMobileAny ? '1rem' : '1.25rem',
                  color: 'rgba(255, 255, 255, 0.7)',
                }}>
                  Select airspace
                </div>
              </div>
            </div>
          ) : (
            /* Mouse controls for desktop */
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1.2fr 1fr',
              alignItems: 'start',
              gap: '2rem',
              padding: '0 8%',
              width: '100%',
              maxWidth: '1400px',
            }}>
              <div style={{ textAlign: 'center', justifySelf: 'end', paddingRight: '2rem' }}>
                <div style={{
                  fontSize: '2.5rem',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.9)',
                  textShadow: '0 2px 12px rgba(0, 0, 0, 0.6)',
                  lineHeight: 1.3,
                }}>
                  Left Click
                </div>
                <div style={{
                  fontSize: '2.5rem',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.9)',
                  textShadow: '0 2px 12px rgba(0, 0, 0, 0.6)',
                  lineHeight: 1.3,
                }}>
                  Drag
                </div>
              </div>
              <div style={{ textAlign: 'center', justifySelf: 'center' }}>
                <div style={{
                  fontSize: '2.5rem',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.9)',
                  textShadow: '0 2px 12px rgba(0, 0, 0, 0.6)',
                  lineHeight: 1.3,
                }}>
                  Mouse Wheel
                </div>
                <div style={{
                  fontSize: '2.5rem',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.9)',
                  textShadow: '0 2px 12px rgba(0, 0, 0, 0.6)',
                  lineHeight: 1.3,
                }}>
                  Zoom In/Out
                </div>
              </div>
              <div style={{ textAlign: 'center', justifySelf: 'start', paddingLeft: '2rem' }}>
                <div style={{
                  fontSize: '2.5rem',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.9)',
                  textShadow: '0 2px 12px rgba(0, 0, 0, 0.6)',
                  lineHeight: 1.3,
                }}>
                  Right Click
                </div>
                <div style={{
                  fontSize: '2.5rem',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.9)',
                  textShadow: '0 2px 12px rgba(0, 0, 0, 0.6)',
                  lineHeight: 1.3,
                }}>
                  Rotate and Tilt
                </div>
              </div>
            </div>
          )}
          <div style={{
            fontSize: isMobileAny ? '0.875rem' : '1rem',
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.7)',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
            marginTop: '2rem',
            textAlign: 'center',
          }}>
            {isTouch ? 'Tap anywhere to dismiss' : 'Click anywhere to dismiss'}
          </div>
        </div>
      )}

      {/* Browser compatibility notice */}
      <BrowserNotice />

      {/* iOS renderer-limitation notice */}
      <IOSNotice />

      {/* Copyright notice at bottom - fixed position to escape map stacking context */}
      <div
        style={{
          position: 'fixed',
          bottom: isMobileAny ? 'calc(env(safe-area-inset-bottom, 0px) + 8px)' : 16,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '11px',
          color: 'rgba(255, 255, 255, 0.9)',
          zIndex: 1000,
          textShadow: '0 1px 4px rgba(0, 0, 0, 0.9), 0 0 8px rgba(0, 0, 0, 0.6)',
          fontWeight: 500,
          pointerEvents: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        © 2026{' '}
        <a
          href="mailto:Llew Roberts <llew@llew.net>"
          title="Click to send email with comments, questions, bugs, or feedback"
          style={{
            color: 'rgba(255, 255, 255, 0.9)',
            textDecoration: 'none',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
            e.currentTarget.style.textDecoration = 'none';
          }}
        >
          Inertial Navigation LLC
        </a>
      </div>
    </div>
  );
}
