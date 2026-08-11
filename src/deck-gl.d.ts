// deck.gl v8 ships without native TypeScript type declarations.
// (v9 added them; we downgraded to v8 for iOS Safari / WebKit compatibility.)
// Untyped modules default to `any`, which is acceptable for this app's usage.

declare module '@deck.gl/core';
declare module '@deck.gl/layers';
declare module '@deck.gl/mapbox';
declare module '@deck.gl/react';
