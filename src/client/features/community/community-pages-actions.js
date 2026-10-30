// community pages, what happens on a click, a key or a submit: actionsOf, formsOf, onClick, onSubmit.

export const actionsOf = pane => Object.assign({}, ...pane.pages.map(page => page.actions));

export const formsOf = pane => Object.assign({}, ...pane.pages.map(page => page.forms));

export async function onClick(pane, event) {
  const button = event.target.closest("[data-community]");
  if (!button) {
    return;
  }
  try {
    await pane.actions[button.dataset.community]?.(button, event);
  } catch (error) {
    pane.tell(error.message);
  }
}

export async function onSubmit(pane, event) {
  const form = event.target;
  const handler = pane.forms[form.id];
  if (handler) {
    event.preventDefault();
    await handler(form, new FormData(form));
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onClick, onSubmit };
