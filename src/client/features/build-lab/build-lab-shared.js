/** A browser that keeps nothing (storage disabled): the builds are simply not kept. */
const NO_STORAGE = {
  getItem: () => null,
  setItem() {
    throw new Error("no storage");
  }
};

export const storage = () => {
  try {
    return window.localStorage ?? NO_STORAGE;
  } catch {
    return NO_STORAGE;
  }
};
