import { en } from "./texts-en.js";
import { fr } from "./texts-fr.js";

export const TEXTS = { en, fr };

/** The language a text is written in for a language of the site: French for French, the English reference for the rest. */
export const textLanguage = language => (language === "fr" ? "fr" : "en");
