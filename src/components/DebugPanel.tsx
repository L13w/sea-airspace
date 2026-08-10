import { useState, useEffect } from 'react';

// Only visible when URL has ?debug=1. Reports what deck.gl / WebGL are actually doing.
// Remove once the iOS Safari render issue is resolved.

export interface DebugInfo {
  layerCount: number;
  featureCount: number;
  deckErrors: string[];
}

function detectWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    if (gl2) return 'WebGL2';
    const gl1 = canvas.getContext('webgl');
    if (gl1) return 'WebGL1';
    return 'none';
  } catch (e) {
    return `error: ${(e as Error).message}`;
  }
}

export function DebugPanel({ layerCount, featureCount, deckErrors }: DebugInfo) {
  const enabled =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debug') === '1';

  const [webgl] = useState(detectWebGL);
  const [jsErrors, setJsErrors] = useState<string[]>([]);
  const [unhandled, setUnhandled] = useState<string[]>([]);
  const [canvases, setCanvases] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const onErr = (e: ErrorEvent) => {
      setJsErrors((prev) =>
        [...prev, `${e.message} @ ${e.filename?.split('/').pop() ?? '?'}:${e.lineno}`].slice(-5),
      );
    };
    const onRej = (e: PromiseRejectionEvent) => {
      setUnhandled((prev) => [...prev, String(e.reason).slice(0, 200)].slice(-5));
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);

    // Periodically re-inspect canvases (deck.gl mounts async).
    const inspect = () => {
      const nodes = Array.from(document.querySelectorAll('canvas'));
      const info = nodes.map((c, i) => {
        const cs = window.getComputedStyle(c);
        const parent = c.parentElement;
        const w = c.width, h = c.height;
        const cw = c.clientWidth, ch = c.clientHeight;
        return (
          `[${i}] ${w}x${h}px int, ${cw}x${ch}px css, ` +
          `z=${cs.zIndex}, pos=${cs.position}, disp=${cs.display}, ` +
          `opac=${cs.opacity}, vis=${cs.visibility}, ` +
          `parent=${parent?.tagName?.toLowerCase() ?? '?'}` +
          (parent?.className ? `.${String(parent.className).slice(0, 30)}` : '')
        );
      });
      setCanvases(info);
    };
    inspect();
    const t = setInterval(inspect, 2000);

    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
      clearInterval(t);
    };
  }, [enabled]);

  if (!enabled) return null;

  const ua = navigator.userAgent;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 60,
        left: 8,
        right: 8,
        maxWidth: 380,
        zIndex: 5000,
        background: 'rgba(0,0,0,0.9)',
        color: '#0f0',
        padding: 8,
        fontSize: 10,
        fontFamily: 'monospace',
        lineHeight: 1.4,
        border: '1px solid #0f0',
        borderRadius: 4,
        pointerEvents: 'none',
        wordBreak: 'break-word',
      }}
    >
      <div style={{ color: '#0ff', fontWeight: 700 }}>DEBUG (?debug=1)</div>
      <div>WebGL support: {webgl}</div>
      <div>Features fetched: {featureCount}</div>
      <div>Deck layers: {layerCount}</div>
      <div>Deck errors: {deckErrors.length}</div>
      {deckErrors.map((e, i) => (
        <div key={`d${i}`} style={{ color: '#f66' }}>
          · {e}
        </div>
      ))}
      <div>JS errors: {jsErrors.length}</div>
      {jsErrors.map((e, i) => (
        <div key={`j${i}`} style={{ color: '#f66' }}>
          · {e}
        </div>
      ))}
      <div>Canvases in DOM: {canvases.length}</div>
      {canvases.map((c, i) => (
        <div key={`c${i}`} style={{ color: '#ff0', fontSize: 9 }}>
          {c}
        </div>
      ))}
      <div>Unhandled rejections: {unhandled.length}</div>
      {unhandled.map((e, i) => (
        <div key={`u${i}`} style={{ color: '#f66' }}>
          · {e}
        </div>
      ))}
      <div style={{ marginTop: 4, opacity: 0.7 }}>UA: {ua.slice(0, 200)}</div>
    </div>
  );
}
