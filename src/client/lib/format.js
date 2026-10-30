import { date as formatLocalDate, percentage } from "../app/browser-i18n.js";

export function formatDuration(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function parseDuration(value) {
  const match = String(value)
    .trim()
    .match(/^(\d{1,3}):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function percent(value) {
  return value === null || value === undefined ? null : percentage(value, 1);
}

export function formatSeconds(value) {
  return Number.isInteger(value) ? `${value}s` : `${Math.round(value * 10) / 10}s`;
}

export function formatDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : formatLocalDate(date);
}
