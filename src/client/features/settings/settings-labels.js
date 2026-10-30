// settings page, small helpers: modeLabel, modeText, controlLabel, controlText, and 1 more.
import { t } from "../../app/browser-i18n.js";

export const modeLabel = mode =>
  ({
    "global-ban-pick": t("Global Ban & Pick"),
    "free-for-all": t("Free For All"),
    classic: t("Classic")
  })[mode];

export const modeText = mode =>
  ({
    "global-ban-pick": t("Each team can only pick a hero once in this series."),
    "free-for-all": t("Heroes can be picked again freely in later games."),
    classic: t(
      "Picks only, and both sides can take the same hero. Online, you only see your own picks until the draft ends."
    )
  })[mode];

export const controlLabel = control =>
  ({
    solo: t("Solo"),
    "two-players": t("Two players · local"),
    online: t("Online · invite a player")
  })[control];

export const controlText = control =>
  ({
    solo: t("You control both sides of this local draft."),
    "two-players": t("Players hand off the same device after each side's turn."),
    online: t("The draft is shared live with an invited opponent.")
  })[control];

export const pageLabel = path =>
  ({
    "/": t("Overview"),
    "/scrims": t("Scrims"),
    "/training": t("Training"),
    "/find": t("Find a scrim"),
    "/agenda": t("Agenda")
  })[path];
