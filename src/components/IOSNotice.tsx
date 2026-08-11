import { useState, useEffect } from 'react';

// Duplicates the check in Map3D.tsx (kept local to avoid a shared util for one
// four-line snippet). iPhone/iPad by UA plus the iPad-on-MacIntel touchpoint hint.
function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function IOSNotice() {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (!detectIOS()) return;
    if (sessionStorage.getItem('ios-notice-dismissed')) return;
    const timer = setTimeout(() => setIsVisible(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      sessionStorage.setItem('ios-notice-dismissed', 'true');
    }, 300);
  };

  if (!isVisible) return null;

  return (
    <div
      className="glass-panel"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 56px)',
        left: '50%',
        transform: `translateX(-50%) ${isExiting ? 'translateY(20px)' : 'translateY(0)'}`,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        zIndex: 4000,
        opacity: isExiting ? 0 : 1,
        transition: 'all 0.3s ease',
        animation: 'iosSlideUpFade 0.4s ease-out',
        maxWidth: 'calc(100vw - 24px)',
        width: '340px',
      }}
    >
      <style>{`
        @keyframes iosSlideUpFade {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>

      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(251, 191, 36, 0.05))',
          border: '1px solid rgba(251, 191, 36, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: '2px',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent-gold)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            marginBottom: '3px',
          }}
        >
          Limited visuals on iOS
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            lineHeight: 1.45,
          }}
        >
          iOS graphics restrictions force a simpler renderer here.
          For the full 3D experience, try{' '}
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>desktop</span> or{' '}
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Android</span>.
        </div>
      </div>

      <button
        onClick={handleDismiss}
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '6px',
          border: '1px solid var(--border-subtle)',
          background: 'rgba(255, 255, 255, 0.03)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          padding: 0,
        }}
        aria-label="Dismiss notice"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
