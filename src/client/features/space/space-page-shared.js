import { t } from "../../app/browser-i18n.js";

export const sectionLabel = section =>
  ({
    tierLists: t("Tier lists"),
    builds: t("Builds"),
    training: t("Training sheet")
  })[section] ?? section;
