// The link to a hero's page: /heroes/agudo, its name (shared/hero-slug.js), from the roster in memory. Every page
// that links to a hero goes through it, so that no link points to the old address with the number.
import { heroPath } from "../../shared/hero-slug.js";
import { state } from "../app/app-state.js";

export const heroHref = id => heroPath(state.heroes, id);
