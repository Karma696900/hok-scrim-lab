// team list, small helpers: signedIn.

export const signedIn = view => Boolean(view.state.auth.user);

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { signedIn };
