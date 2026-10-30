// The facts the legal pages need that only the owner of the site knows: who publishes it, who hosts it, where to write.
// Fill in the empty strings. A field left empty is drawn on the page as a visible "to complete" mark (never as a
// blank), and src/client/features/legal/legal.test.js lists what is still missing.

export const LEGAL_INFO = {
  /** Name of the person, association or company that publishes the site (the data controller of the GDPR). */
  publisher: "Karma",
  /** What the publisher is: "an individual", "an association", "a company" (French and English texts: see texts.js). */
  publisherKind: "particulier",
  /** Postal address of the publisher; an individual who stays anonymous leaves it empty and gives the host instead. */
  publisherAddress: "",
  /** Country the publisher lives in (the law that applies, and the authority people may complain to). */
  country: "France",
  /** The address people write to, for questions and for the rights of the GDPR. */
  contactEmail: "karmaisafool69@gmail.com",
  /** The host: name, postal address and a way to reach it. */
  hostName: "Hetzner Online GmbH",
  hostAddress: "Industriestr. 25, 91710 Gunzenhausen, Germany",
  hostContact: "https://www.hetzner.com",
  /** When the texts were last changed (a date, YYYY-MM-DD). */
  updated: "2026-10-30"
};

/** The fields a page cannot do without, by name: what the legal notice and the privacy policy quote. */
export const REQUIRED_FIELDS = ["publisher", "contactEmail", "hostName", "hostAddress"];

/** The names of the fields that are still empty. */
export const missingFields = (info = LEGAL_INFO) =>
  REQUIRED_FIELDS.filter(field => !String(info[field] ?? "").trim());
