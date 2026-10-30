// Camp artwork is published at print size: every picture is requested through /media/img, which
// resizes it and serves WebP.
const WIDTHS = [96, 160, 320, 480, 640, 960, 1280];

/**
 * How the pictures are made (server/features/media/image-proxy-parts.js: enlargement of the small ones, quality). It is in
 * the address of every picture and in the key of the copies on disk: the browsers keep a picture for a year, so a better
 * recipe must be a new address, and its number goes up with the recipe.
 */
export const PICTURE_RECIPE = 2;

/** The resized address of a Camp image (any other address is returned untouched). */
export function resized(url, width) {
  if (typeof url !== "string" || !url.startsWith("https://")) {
    return url;
  }
  const fit = WIDTHS.find(candidate => candidate >= width) ?? WIDTHS[WIDTHS.length - 1];
  return `/media/img?w=${fit}&u=${encodeURIComponent(url)}&v=${PICTURE_RECIPE}`;
}

/**
 * src + srcset + sizes attributes (as an HTML string) for an image shown `cssWidth` pixels wide: 1x
 * and 2x screens get what they need.
 */
export function responsive(url, cssWidth, sizes = `${cssWidth}px`) {
  if (typeof url !== "string" || !url.startsWith("https://")) {
    return `src="${url}"`;
  }
  const small = resized(url, cssWidth),
    large = resized(url, cssWidth * 2);
  return small === large
    ? `src="${small}"`
    : `src="${small}" srcset="${small} ${WIDTHS.find(w => w >= cssWidth)}w, ${large} ${WIDTHS.find(w => w >= cssWidth * 2) ?? 1280}w" sizes="${sizes}"`;
}

/**
 * The same as wide(), as data- attributes: a script (watchLazy in app.js) puts the real ones in
 * when the picture nears the screen. Browsers start "lazy" pictures thousands of pixels early;
 * these start 300 px early.
 */
export function deferred(url, widths = [480, 960, 1280], sizes = "100vw") {
  if (typeof url !== "string" || !url.startsWith("https://")) {
    return `data-src="${url}"`;
  }
  return `data-src="${resized(url, widths[Math.min(1, widths.length - 1)])}" data-srcset="${widths.map(width => `${resized(url, width)} ${width}w`).join(", ")}" sizes="${sizes}"`;
}

/** responsive(), deferred the same way (see deferred()). */
export function deferredResponsive(url, cssWidth, sizes = `${cssWidth}px`) {
  if (typeof url !== "string" || !url.startsWith("https://")) {
    return `data-src="${url}"`;
  }
  const small = resized(url, cssWidth),
    large = resized(url, cssWidth * 2);
  return small === large
    ? `data-src="${small}"`
    : `data-src="${small}" data-srcset="${small} ${WIDTHS.find(w => w >= cssWidth)}w, ${large} ${WIDTHS.find(w => w >= cssWidth * 2) ?? 1280}w" sizes="${sizes}"`;
}

/** A wide picture: several widths, the browser takes the one that fits its viewport. */
export function wide(url, widths = [480, 960, 1280], sizes = "100vw") {
  if (typeof url !== "string" || !url.startsWith("https://")) {
    return `src="${url}"`;
  }
  return `src="${resized(url, widths[Math.min(1, widths.length - 1)])}" srcset="${widths.map(width => `${resized(url, width)} ${width}w`).join(", ")}" sizes="${sizes}"`;
}
