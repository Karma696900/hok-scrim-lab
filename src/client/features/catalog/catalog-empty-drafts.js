// What a new entry of each section starts with: the name empty, the category and the colour of the filter in use.
import { SHOP_CATEGORIES } from "../../domain/catalog-display.js";
import { blankLine } from "./catalog-form.js";

export const emptyDrafts = view => ({
  stats: () => ({
    name: "",
    unit: "flat",
    sortOrder: (view.catalog.stats.at(-1)?.sortOrder ?? 0) + 1,
    options: []
  }),
  tags: () => ({ name: "", color: "gray", description: "", conflicts: [] }),
  items: () => ({
    name: "",
    category: view.categoryFilter || "regular",
    shopCategory: SHOP_CATEGORIES.includes(view.shopFilter) ? view.shopFilter : null,
    price: "",
    imageId: null,
    description: "",
    effects: [],
    stats: [],
    tags: []
  }),
  spells: () => ({
    name: "",
    imageId: null,
    description: "",
    cooldownSeconds: null,
    unlockLevel: null
  }),
  arcana: () => ({
    name: "",
    color: view.colorFilter || "red",
    imageId: null,
    description: "",
    stats: [blankLine(view.catalog.stats[0]?.id)],
    tags: []
  })
});
