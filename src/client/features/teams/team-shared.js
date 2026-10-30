import { LANGUAGES } from "../../../shared/i18n.js";

export const STAFF = ["owner", "manager"];
export const LEADERS = ["owner", "manager", "coach"]; // who may put a series on the team

export const languageNames = codes =>
  codes.map(code => LANGUAGES.find(language => language.code === code)?.name ?? code);

export const formError = id => `<p class="form-error" id="${id}" role="alert"></p>`;
