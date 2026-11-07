// The icons of the interface: 24 x 24, drawn with a 1.7 stroke, one path each (the same set as the
// design mock-up). Both the server (the page shell) and the browser (every view) draw them, so the
// table lives in shared/.

export const ICONS = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  swords:
    "M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 21l2-2",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  shieldcheck: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  users:
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7M18 14.5a7 7 0 0 1 4 6.5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  sliders: "M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6",
  bell: "M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  chevron: "M6 9l6 6 6-6",
  up: "M6 15l6-6 6 6",
  right: "M9 6l6 6-6 6",
  left: "M15 6l-6 6 6 6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  hourglass: "M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9",
  flame: "M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-2 3-3 3 0-4-2-7-5-9 0 5-3 7-3 12 0 4 3 8 7 8z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M9 8h6",
  bookmark: "M6 3h12v18l-6-4-6 4z",
  spark:
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z",
  check: "M5 12l5 5 9-10",
  x: "M6 6l12 12M18 6L6 18",
  ban: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8",
  play: "M7 4l13 8-13 8z",
  pause: "M8 5v14M16 5v14",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  key: "M14 10a4 4 0 1 0-3.9-3A4 4 0 0 0 14 10zM11 9l-8 8v3h3v-2h2v-2h2l1-1",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeoff:
    "M3 3l18 18M10.6 6.2A9.6 9.6 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 3.6M6.5 7.6A17 17 0 0 0 2 12s4 7 10 7a9.5 9.5 0 0 0 4-.9",
  send: "M3 11l18-8-8 18-2-8z",
  filter: "M3 5h18l-7 8v6l-4 2v-8z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  rows: "M3 5h18v6H3zM3 13h18v6H3z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  heart: "M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z",
  pin: "M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  drag: "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  command: "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  medal: "M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM8.5 14L7 22l5-3 5 3-1.5-8",
  crown: "M3 8l4 4 5-7 5 7 4-4-2 11H5z",
  flag: "M5 21V4M5 4h12l-2 4 2 4H5",
  pencil: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  copy: "M9 9h11v11H9zM5 15V4h11",
  link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  more: "M5 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0M17 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  warn: "M12 3l10 18H2zM12 10v5M12 18h.01",
  phone: "M7 2h10v20H7zM11 18h2",
  logout: "M10 4H5v16h5M15 8l4 4-4 4M19 12H9",
  tag: "M3 12V4h8l10 10-8 8zM7.5 8h.01",
  swap: "M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  refresh: "M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M9 9h.01",
  video: "M3 6h12v12H3zM15 10l6-3v10l-6-3",
  sort: "M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4",
  hash: "M5 9h14M5 15h14M10 4L8 20M16 4l-2 16",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5",
  gem: "M6 3h12l4 6-10 12L2 9zM2 9h20M9 3l-2 6 5 12 5-12-2-6",
  chat: "M4 5h16v11H9l-5 4z",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z",
  discord:
    "M8 7.5c2.6-1 5.4-1 8 0 1.8 1.7 2.9 4.2 3.5 7.6-1.4 1.1-2.8 1.8-4.3 2.2l-1-1.7M8 7.5C6.2 9.2 5.1 11.7 4.5 15.1c1.4 1.1 2.8 1.8 4.3 2.2l1-1.7M9.5 15.6c1.7.5 3.3.5 5 0M9.2 12.2a.6.6 0 1 0 1.2 0 .6.6 0 1 0-1.2 0M13.6 12.2a.6.6 0 1 0 1.2 0 .6.6 0 1 0-1.2 0",
  google: "M20 12h-8M20 12a8 8 0 1 1-2.4-5.7",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4",
  zap: "M13 2L4 14h7l-1 8 9-12h-7z",
  maximize: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  sidebar: "M3 4h18v16H3zM9 4v16",
  wifi: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01",
  dice: "M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"
};

/**
 * The markup of one icon. `extra` adds classes: "i--sm" (16 px), "i--lg" (24 px), "i--xl" (32 px),
 * "i--duo" (a soft fill under the stroke), "i--fill" (solid).
 */
// Icons that point somewhere: in a right-to-left page they turn around (see components/icons.css).
const DIRECTIONAL = new Set(["left", "right", "arrow", "logout", "undo", "send"]);

export function icon(name, extra = "") {
  const path = ICONS[name];
  if (!path) {
    throw new Error(`Unknown icon "${name}".`);
  }
  const classes = ["i", DIRECTIONAL.has(name) && "i--dir", extra].filter(Boolean).join(" ");
  return `<svg class="${classes}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}
