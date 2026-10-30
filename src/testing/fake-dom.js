// Just enough of a browser for the pages that draw HTML to be loaded and run in Node: `document`, `location`, `history`.
// Install it before importing a client module (they read `document` when they load), then call `fakeRoot()` for the
// element a page draws into.
export function installFakeDom({ search = "", pathname = "/" } = {}) {
  const classList = { contains: () => false, add() {}, remove() {}, toggle() {} };
  const element = () => ({
    classList,
    dataset: {},
    style: {},
    hidden: false,
    setAttribute() {},
    getAttribute: () => null,
    addEventListener() {},
    append() {},
    appendChild() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    matches: () => false,
    focus() {}
  });
  globalThis.document = {
    ...element(),
    documentElement: { ...element(), lang: "en", dir: "ltr" },
    body: element(),
    createElement: element,
    querySelector: () => element(),
    querySelectorAll: () => []
  };
  globalThis.MutationObserver = class {
    observe() {}
  };
  globalThis.Node = { ELEMENT_NODE: 1 };
  globalThis.location = { search, pathname, href: `http://localhost${pathname}${search}` };
  globalThis.history = { replaceState() {}, pushState() {} };
  globalThis.window = globalThis;
  return {
    /** Changes the address bar the way a link with a query string would. */
    go(newSearch, newPathname = pathname) {
      globalThis.location.search = newSearch;
      globalThis.location.pathname = newPathname;
    }
  };
}

/** An element that keeps the HTML a page gives it, as `innerHTML`. */
export function fakeRoot() {
  return {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
    classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
    dataset: {}
  };
}
