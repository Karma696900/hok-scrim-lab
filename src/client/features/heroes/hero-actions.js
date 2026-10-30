import { installBuildActions, installSheetActions } from "./hero-actions-sheet.js";
import { installEditActions, installRosterActions } from "./hero-actions-roster.js";
import { installListControls } from "./hero-actions-list.js";

export function installHeroesActions() {
  installSheetActions();
  installBuildActions();
  installListControls();
  installRosterActions();
  installEditActions();
}
