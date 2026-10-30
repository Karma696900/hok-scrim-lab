// A page keeps what it shares in one object (`view`) and its functions in several files. Each function takes that object
// first, and is registered on it so that the others call it as `view.name(...)`: no file imports another one back,
// and a function given to `addEventListener` is always the same function, so `removeEventListener` finds it.
// Each file lists its functions in an `onView` table; the page registers the tables of all its files.
export function bindTo(view, ...tables) {
  for (const table of tables) {
    for (const [name, fn] of Object.entries(table)) {
      view[name] = fn.bind(null, view);
    }
  }
  return view;
}
