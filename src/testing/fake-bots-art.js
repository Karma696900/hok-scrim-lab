// The pictures of the minions and of the monsters as the bots server sends them in its start message (a 1-pixel WebP
// each: the real ones are the game's and stay on the bots server).
const PIXEL = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";

export const FAKE_ART = Object.fromEntries([
  ...["blue", "red"].flatMap(side => ["melee", "ranged"].map(kind => [`${side}-${kind}`, PIXEL])),
  ...["boar", "boarling", "tyrant", "shadow-tyrant"].map(kind => [`monster-${kind}`, PIXEL])
]);
