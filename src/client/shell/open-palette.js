// The search palette is downloaded when it is first wanted (or when the page is idle): the code that opens it is all the
// first paint carries.
let palette = null;

export const loadPalette = () => (palette ??= import("./palette.js"));

export const openPalette = () => loadPalette().then(module => module.openPalette());
