import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;
// Touch devices (tablets, large phones) use a wider breakpoint because the
// desktop side-panels (profile + info panel) crowd the map even at 800–1024px.
// Pointer-only devices at the same width are usually resized browser windows
// where the user can just widen them, so we keep the tight 768px cutoff there.
const TOUCH_MOBILE_BREAKPOINT = 1100;

function computeIsMobile(): boolean {
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const bp = isTouch ? TOUCH_MOBILE_BREAKPOINT : MOBILE_BREAKPOINT;
  return window.innerWidth <= bp;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return computeIsMobile();
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(computeIsMobile());
    };

    // Check on mount
    checkMobile();

    // Listen for resize
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  });

  useEffect(() => {
    const checkTouch = () => {
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    checkTouch();
  }, []);

  return isTouch;
}

// Detect mobile device in landscape orientation
// This catches phones/tablets rotated to landscape where width > 768 but it's still a touch device
export function useIsMobileLandscape(): boolean {
  const isTouch = useIsTouchDevice();
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === 'undefined') return false;
    // Landscape: width > height AND height is small (mobile-sized)
    return window.innerWidth > window.innerHeight && window.innerHeight <= 500;
  });

  useEffect(() => {
    const checkLandscape = () => {
      setIsLandscape(window.innerWidth > window.innerHeight && window.innerHeight <= 500);
    };

    checkLandscape();
    window.addEventListener('resize', checkLandscape);
    window.addEventListener('orientationchange', checkLandscape);
    return () => {
      window.removeEventListener('resize', checkLandscape);
      window.removeEventListener('orientationchange', checkLandscape);
    };
  }, []);

  return isTouch && isLandscape;
}
