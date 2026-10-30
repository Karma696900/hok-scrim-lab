export const KEY = "hok_bg"; // "off" | hero id (absent = random)

export const PICK = "hok_bg_pick"; // the random choice of this session

export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Data-saver, a slow or metered link: no video. (Browsers without the Network Information API are
// judged on their screen and on the first interaction below.)
export const lowData = () => {
  const link = navigator.connection;
  return (
    link?.saveData === true ||
    (link?.effectiveType && link.effectiveType !== "4g") ||
    (typeof link?.downlink === "number" && link.downlink < 5)
  );
};

export const canPlay = () => !reduced() && !lowData() && matchMedia("(min-width: 900px)").matches;

export const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
