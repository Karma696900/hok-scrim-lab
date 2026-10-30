import { t } from "../../app/browser-i18n.js";

export const categoryLabel = category =>
  ({
    boots: t("Boots"),
    regular: t("Item"),
    utility: t("Utility item"),
    late: t("Late-game item")
  })[category] ?? category;

export const colorLabel = color =>
  ({ red: t("Red"), blue: t("Blue"), green: t("Green") })[color] ?? color;

export const unitLabel = unit =>
  ({
    percent: t("Percent (%)"),
    whole: t("Whole number"),
    choice: t("Choice (a list of options)")
  })[unit] ?? t("Flat number");
