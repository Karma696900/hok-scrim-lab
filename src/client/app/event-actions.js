// The page reacts to clicks, changes, form submissions and typing in one place. Every feature
// registers what it handles (`onAction("name", handler)`), and the four listeners below find the
// handler for the event.
import { app, tell } from "../lib/dom.js";
import { authPagesPromise } from "./lazy-pages.js";

const clickRules = []; // { selector, accept, handler }: for clicks that do not carry a data-action
const clickActions = new Map(); // data-action -> handler(button, event, action)
const changeRules = []; // { match, handler }
const submitRules = [];
const inputRules = [];

/**
 * A click on an element matching the selector (and accepted by `accept`). The first rule that
 * matches handles the click.
 */
export function onClick(selector, handler, accept = () => true) {
  clickRules.push({ selector, accept, handler });
}

/** A click on a button with data-action="name" (or one of several names). */
export function onAction(names, handler) {
  for (const name of [names].flat()) {
    clickActions.set(name, handler);
  }
}

/**
 * Buttons of a page that is downloaded when somebody needs it (app/lazy-actions.js lists them): the first click brings the
 * page, which registers its own handlers (onAction) as it starts; the click is then given to the real handler.
 */
export function onLazyActions(names, load) {
  for (const name of names) {
    const stub = async (button, event, action) => {
      await load();
      const real = clickActions.get(action);
      if (real && real !== stub) {
        await real(button, event, action);
      }
    };
    clickActions.set(name, stub);
  }
}

/** A change event for which `match(event)` is true. */
export function onChange(match, handler) {
  changeRules.push({ match, handler });
}

/** A submitted form for which `match(event)` is true. */
export function onSubmit(match, handler) {
  submitRules.push({ match, handler });
}

/** Typing in a field for which `match(event)` is true. */
export function onInput(match, handler) {
  inputRules.push({ match, handler });
}

/** Runs a handler; an error becomes a message instead of a silent failure. */
async function run(handler, ...parameters) {
  try {
    await handler(...parameters);
  } catch (error) {
    tell(error.message);
  }
}

export function installActions() {
  app.addEventListener("click", async event => {
    // The account pages (sign in, registration, security) handle their own buttons once they are
    // loaded.
    if (authPagesPromise && (await (await authPagesPromise).onClick(event))) {
      return;
    }
    for (const rule of clickRules) {
      const element = event.target.closest(rule.selector);
      if (element && rule.accept(element)) {
        await rule.handler(element, event);
        return;
      }
    }
    const button = event.target.closest("[data-action]");
    const handler = button && clickActions.get(button.dataset.action);
    if (handler) {
      await run(handler, button, event, button.dataset.action);
    }
  });

  app.addEventListener("change", async event => {
    const rule = changeRules.find(item => item.match(event));
    if (rule) {
      await run(rule.handler, event);
    }
  });

  app.addEventListener("submit", async event => {
    const rule = submitRules.find(item => item.match(event));
    if (rule) {
      await run(rule.handler, event);
    }
  });

  app.addEventListener("input", event => {
    const rule = inputRules.find(item => item.match(event));
    if (rule) {
      rule.handler(event);
    }
  });
}
