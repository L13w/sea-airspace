import { useState, useCallback, useMemo } from 'react';
import Map, { useControl } from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { GeoJsonLayer } from '@deck.gl/layers';
import type { MapboxOverlayProps } from '@deck.gl/mapbox';
import type { PickingInfo } from '@deck.gl/core';
import { useAirspaceData, SEATTLE_BOUNDS } from '../hooks/useAirspaceData';
import { InfoPanel } from './InfoPanel';
import { Legend } from './Legend';
import { AirspaceProfile } from './AirspaceProfile';
import { AltitudeScale } from './AltitudeScale';
import { formatAltitude } from '../utils/altitudeUtils';
import { getOutlineColor, HIGHLIGHT_COLORS } from '../utils/colorUtils';
import type { ProcessedAirspace } from '../types/airspace';
import 'maplibre-gl/dist/maplibre-gl.css';

const INITIAL_VIEW = {
  longitude: -122.45,
  latitude: 47.35,
  zoom: 8.5,
  pitch: 55,
  bearing: -20,
};

// Vertical exaggeration factor - makes altitude differences visible
const ALTITUDE_EXAGGERATION = 16.7;

// deck.gl overlay component using react-map-gl's useControl hook
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

export function Map3D() {
  const { data, loading, error } = useAirspaceData(SEATTLE_BOUNDS);
  const [selectedAirspace, setSelectedAirspace] = useState<ProcessedAirspace | null>(null);
  const [hoveredAirspace, setHoveredAirspace] = useState<ProcessedAirspace | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [showClassE, setShowClassE] = useState(false);
  const [showHelpOverlay, setShowHelpOverlay] = useState(true);

  const handleClick = useCallback((info: PickingInfo) => {
    if (info.object) {
      setSelectedAirspace(info.object as ProcessedAirspace);
    } else {
      setSelectedAirspace(null);
    }
  }, []);

  const handleHover = useCallback((info: PickingInfo) => {
    if (info.object) {
      const obj = info.object as ProcessedAirspace;
      setHoveredAirspace(obj);
      setHoverInfo({
        x: info.x,
        y: info.y,
        object: obj,
      });
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

  const layers = useMemo(() => {
    if (!sortedData.length) return [];

    const selectedId = selectedAirspace?.properties.OBJECTID;
    const hoveredId = hoveredAirspace?.properties.OBJECTID;

    // Base layer - solid filled polygons for each airspace volume
    // @ts-expect-error deck.gl 9.x has complex generic types
    const fillLayer = new GeoJsonLayer({
        id: 'airspace-fill-layer',
        data: {
          type: 'FeatureCollection',
          features: sortedData,
        },
        pickable: true,
        stroked: false,
        filled: true,
        extruded: true,
        wireframe: false,

        // 3D configuration
        getElevation: (d: ProcessedAirspace) => d.extrusionHeight * ALTITUDE_EXAGGERATION,
        elevationScale: 1,

        // Solid fill with class-based color
        getFillColor: (d: ProcessedAirspace) => {
          const isSelected = d.properties.OBJECTID === selectedId;
          const isHovered = d.properties.OBJECTID === hoveredId;

          if (isSelected) {
            return HIGHLIGHT_COLORS.selected;
          }
          if (isHovered) {
            return HIGHLIGHT_COLORS.hover;
          }

          // Use the airspace color with adjusted opacity based on class
          const baseColor = d.color;
          // Make Class B more visible, others slightly more transparent
          const classOpacity: Record<string, number> = {
            B: 100,
            C: 80,
            D: 70,
            E: 50,
          };
          const opacity = classOpacity[d.properties.CLASS] || 60;

          return [baseColor[0], baseColor[1], baseColor[2], opacity] as [number, number, number, number];
        },

        // Material for better 3D appearance
        material: {
          ambient: 0.6,
          diffuse: 0.8,
          shininess: 32,
          specularColor: [60, 64, 70],
        },

        // Interactivity
        onClick: handleClick,
        onHover: handleHover,

        // Auto-highlight disabled - we handle highlighting manually via getFillColor
        autoHighlight: false,

        // Update triggers for selection/hover changes
        updateTriggers: {
          getFillColor: [selectedId, hoveredId],
        },
      });

    // Outline layer - crisp edges for each airspace
    // @ts-expect-error deck.gl 9.x has complex generic types
    const outlineLayer = new GeoJsonLayer({
        id: 'airspace-outline-layer',
        data: {
          type: 'FeatureCollection',
          features: sortedData,
        },
        pickable: false,
        stroked: true,
        filled: false,
        extruded: true,
        wireframe: true,

        getElevation: (d: ProcessedAirspace) => d.extrusionHeight * ALTITUDE_EXAGGERATION,
        elevationScale: 1,

        // Outline styling
        getLineColor: (d: ProcessedAirspace) => {
          const isSelected = d.properties.OBJECTID === selectedId;
          const isHovered = d.properties.OBJECTID === hoveredId;

          if (isSelected) {
            return [255, 200, 50, 255] as [number, number, number, number];
          }
          if (isHovered) {
            return [255, 230, 150, 255] as [number, number, number, number];
          }

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
  }, [sortedData, selectedAirspace, hoveredAirspace, handleClick, handleHover]);

  const showProfile = true;
  const show3D = true;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: 'var(--bg-primary)' }}>
      {/* Map container */}
      {show3D && (
        <Map
          initialViewState={INITIAL_VIEW}
          maxPitch={85}
          minPitch={0}
          mapStyle={{
            version: 8,
            sources: {
              'sectional': {
                type: 'raster',
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
                type: 'raster',
                source: 'sectional',
                minzoom: 0,
                maxzoom: 12
              }
            ]
          }}
        >
          <DeckGLOverlay layers={layers} interleaved />
        </Map>
      )}

      {/* Title */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          Seattle Airspace
        </h1>
        <p
          className="mono"
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginTop: '2px',
          }}
        >
          SEA Class B • 3D Visualization
        </p>
      </div>

      {/* Hover tooltip */}
      {hoverInfo && show3D && (
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

      {/* Profile view */}
      {showProfile && data && (
        <AirspaceProfile
          airspaces={data}
          selectedAirspace={selectedAirspace}
          hoveredAirspace={hoveredAirspace}
          onAirspaceClick={handleProfileClick}
          onAirspaceHover={handleProfileHover}
        />
      )}

      {/* Altitude scale */}
      {show3D && data && (
        <AltitudeScale
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

      {/* Legend */}
      {show3D && <Legend compact={!!selectedAirspace} showClassE={showClassE} onShowClassEChange={setShowClassE} />}

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

      {/* Help overlay */}
      {showHelpOverlay && !loading && (
        <div
          onClick={() => setShowHelpOverlay(false)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            zIndex: 3000,
            cursor: 'pointer',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '2.5rem',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.85)',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
              lineHeight: 1.3,
            }}>
              Left Click
            </div>
            <div style={{
              fontSize: '2.5rem',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.85)',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
              lineHeight: 1.3,
            }}>
              Drag
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '2.5rem',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.85)',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
              lineHeight: 1.3,
            }}>
              Mouse Wheel
            </div>
            <div style={{
              fontSize: '2.5rem',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.85)',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
              lineHeight: 1.3,
            }}>
              Zoom In/Out
            </div>
            <div style={{
              fontSize: '1rem',
              fontWeight: 500,
              color: 'rgba(255, 255, 255, 0.85)',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
              marginTop: '2rem',
            }}>
              Click anywhere to dismiss
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '2.5rem',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.85)',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
              lineHeight: 1.3,
            }}>
              Right Click
            </div>
            <div style={{
              fontSize: '2.5rem',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.85)',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
              lineHeight: 1.3,
            }}>
              Rotate and Tilt
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
