// The profile dialog (click on the avatar in the header): pseudo, photo, and the player's tag.
// Loaded when first opened.
import { bindTo } from "../../../shared/bind-to.js";
import { onView as profileParts } from "./profile-parts.js";

export function createProfileDialog({ state, tell, onChange }) {
  const view = { state, onChange, tell };
  bindTo(view, profileParts);
  view.dialog = null;

  return {
    open() {
      if (!view.state.auth.user) {
        return;
      }
      if (!view.dialog) {
        view.build();
      }
      view.paint();
      if (!view.dialog.open) {
        view.dialog.showModal();
      }
    }
  };
}
