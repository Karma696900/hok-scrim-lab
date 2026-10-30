export const DAY = 24 * 3600_000;

export const ATTEND = event => !["availability", "unavailable"].includes(event.kind);

export const monthStart = date => new Date(date.getFullYear(), date.getMonth(), 1);

export const weekStart = date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));

export const addDays = (date, days) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
