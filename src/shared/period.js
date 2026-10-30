// A period of time, as two days (YYYY-MM-DD): the same rules in the browser and on the server. The
// popularity pages look at a period of at least three months, never earlier than the first
// tournament game that was entered.

export const MIN_PERIOD_MONTHS = 3;

const parts = day => day.split("-").map(Number);
const text = date => date.toISOString().slice(0, 10);

/** The day `count` days later (or earlier, when it is negative). */
export function addDays(day, count) {
  const [year, month, date] = parts(day);
  return text(new Date(Date.UTC(year, month - 1, date + count)));
}

/**
 * The same day `count` months later. A month without that day gives its last one: 31 January plus
 * one month is 28 (or 29) February.
 */
export function addMonths(day, count) {
  const [year, month, date] = parts(day);
  const lastOfMonth = new Date(Date.UTC(year, month - 1 + count + 1, 0)).getUTCDate();
  return text(new Date(Date.UTC(year, month - 1 + count, Math.min(date, lastOfMonth))));
}

/** The earliest last day of a period that starts on `from`: 1 July plus three months ends on 30 September. */
export const earliestEnd = (from, months = MIN_PERIOD_MONTHS) =>
  addDays(addMonths(from, months), -1);

/** Does the period span at least `months` months? */
export const spansEnough = (from, to, months = MIN_PERIOD_MONTHS) =>
  to >= earliestEnd(from, months);

/**
 * The period shown when nobody chose one: the last three months, or from the first game when that
 * is more recent (the end is then pushed so that the period still spans three months).
 */
export function defaultPeriod({ today, first = null }) {
  let from = addDays(addMonths(today, -MIN_PERIOD_MONTHS), 1);
  if (first && first > from) {
    from = first;
  }
  const to = today >= earliestEnd(from) ? today : earliestEnd(from);
  return { from, to };
}
