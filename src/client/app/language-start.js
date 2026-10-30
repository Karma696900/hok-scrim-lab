// The server chose the language (the saved choice, else the browser's) and wrote it on <html lang>:
// its catalog is loaded before anything is drawn, so no text flashes in English first.
import { useLanguage } from "./browser-i18n.js";

await useLanguage(document.documentElement.lang);
