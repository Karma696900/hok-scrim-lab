// api keys, small helpers: scopeBoxes, secretBox, doc, list, and 3 more.
import { currentLanguage, t } from "../../app/browser-i18n.js";
import { icon } from "../../../shared/icons.js";

/** The scopes ticked when a key is made: the public data only (a key for an AI rarely needs more). */
export const PUBLIC_SCOPES = ["game", "competitive"];

export const scopeBoxes = view =>
  view.data.scopes
    .map(
      scope =>
        `<label class="ak-scope"><input type="checkbox" name="ak-scope" value="${view.esc(scope)}"${PUBLIC_SCOPES.includes(scope) ? " checked" : ""}><span>${icon("check", "i--sm")}${view.esc(scopeLabel(scope))}</span></label>`
    )
    .join("");

export const secretBox = view =>
  view.fresh
    ? `<div class="ak-secret" role="status">
          <b>${t("Copy your key now: it is shown only once.")}</b>
          <div class="ak-secret__line"><code id="ak-secret-text">${view.esc(view.fresh.secret)}</code><button type="button" class="btn btn--sm" data-ak-copy>${icon("copy", "i--sm")}${t("Copy")}</button></div>
          <small>${t("Use it like this")}</small>
          <pre class="ak-example"><code>curl -H "Authorization: Bearer ${view.esc(view.fresh.secret)}" ${view.esc(location.origin)}/api/v1/heroes</code></pre>
          <button type="button" class="btn btn--ghost btn--sm" data-ak-dismiss>${t("I have saved it")}</button>
        </div>`
    : "";

/** The call that uses a key, always on the page: what to type, and what a key can reach. */
export const doc = view => {
  const base = view.esc(location.origin);
  return `<figure class="ak-doc">
        <figcaption><span>${t("Use it like this")}</span><button type="button" class="btn btn--ghost btn--sm" data-ak-copy-curl>${icon("copy", "i--sm")}${t("Copy")}</button></figcaption>
        <pre class="ak-curl"><code><span class="ak-curl__cmd">curl</span> <span class="ak-curl__flag">-H</span> <span class="ak-curl__text">"Authorization: Bearer hok_YOUR_KEY"</span> \\
  ${base}/api/v1/heroes</code></pre>
        <ul class="ak-paths">${EXAMPLES.map(([path, scope]) => `<li><code>${path}</code><span class="pill pill--grey">${view.esc(scopeLabel(scope))}</span></li>`).join("")}</ul>
      </figure>`;
};

export const list = view => {
  const now = Date.now();
  if (!view.data.items.length) {
    return `<p class="empty-line">${icon("key", "i--sm")}<span>${t("No key yet. Make one above.")}</span></p>`;
  }
  return `<ul class="ak-list">${view.data.items
    .map(key => {
      const pills = key.scopes
        .map(scope => `<span class="pill">${view.esc(scopeLabel(scope))}</span>`)
        .join("");
      const used = key.lastUsedAt
        ? t("Last used {date}", { date: day(key.lastUsedAt) })
        : t("Never used");
      const done = !key.active;
      return `<li class="ak-key${done ? " is-off" : ""}">
          <span class="ak-key__ico">${icon("key")}</span>
          <div class="ak-key__main">
            <div class="ak-key__name"><b>${view.esc(key.name)}</b><code>${view.esc(key.hint)}…</code></div>
            <div class="ak-key__scopes">${pills}</div>
            <small class="ak-key__life">${view.esc(t("Created {date}", { date: day(key.createdAt) }))} · ${view.esc(used)} · ${view.esc(lifeOf(key, now))}</small>
          </div>
          <button type="button" class="btn btn--sm${done ? " btn--ghost" : " btn--danger"}" data-ak-${done ? "remove" : "revoke"}="${view.esc(key.id)}" data-name="${view.esc(key.name)}">${icon(done ? "trash" : "ban", "i--sm")}${done ? t("Remove") : t("Revoke")}</button>
        </li>`;
    })
    .join("")}</ul>`;
};

export const draw = view => {
  const live = view.data.items.filter(key => key.active).length;
  view.onCount?.(live, view.data.max);
  view.root.innerHTML = `${view.secretBox()}
      <div class="ak-console">
        <div class="ak-form" id="ak-form">
          <label class="label">${t("Name of the key")}<span class="field"><input id="ak-name" maxlength="60" placeholder="${view.esc(t("My stats bot"))}" autocomplete="off"></span></label>
          <label class="label">${t("How long it lives")}<span class="field"><select id="ak-lifetime">${view.data.lifetimes
            .map(
              days =>
                `<option value="${days}"${days === view.data.defaultLifetime ? " selected" : ""}>${view.esc(LIFETIME_LABELS()[days] ?? days)}</option>`
            )
            .join("")}</select></span></label>
          <fieldset class="ak-scopes"><legend class="label">${t("What the key can read")}</legend><div>${view.scopeBoxes()}</div></fieldset>
          <div class="ak-actions"><button type="button" class="btn btn--primary" data-ak-create${live >= view.data.max ? " disabled" : ""}>${icon("plus", "i--sm")}${t("Create the key")}</button><small class="muted">${t("{live} of {max} keys in use", { live, max: view.data.max })}</small></div>
        </div>
        ${view.doc()}
      </div>
      <h3 class="ak-title">${t("Your keys")}</h3>
      ${view.list()}
      <p class="muted ak-note">${icon("info", "i--sm")}<span>${t("A key reads what you can read: your scrims, the series your teams shared with you, your tier lists, the game data. It never writes and never carries administrator rights.")}</span></p>`;
};

export async function load(view) {
  view.data = await view.api("/api/me/api-keys");
  view.draw();
}

export async function create(view) {
  const name = view.root.querySelector("#ak-name").value.trim();
  const scopes = [...view.root.querySelectorAll('input[name="ak-scope"]:checked')].map(
    box => box.value
  );
  if (!name) {
    view.tell(t("Name the key first."), "warn");
    return;
  }
  try {
    const answer = await view.api("/api/me/api-keys", {
      method: "POST",
      body: {
        name,
        scopes,
        lifetimeDays: Number(view.root.querySelector("#ak-lifetime").value)
      }
    });
    view.fresh = { secret: answer.secret, name: answer.key.name };
    await view.load();
    view.root.querySelector("#ak-secret-text")?.scrollIntoView({ block: "center" });
  } catch (error) {
    view.tell(error.message, "warn");
  }
}

const SCOPE_LABELS = () => ({
  game: t("Game data"),
  competitive: t("Competitive scene"),
  scrims: t("Your scrims"),
  "tier-lists": t("Your tier lists"),
  teams: t("Your teams"),
  training: t("Your training"),
  account: t("Your account"),
  simulation: t("Game Simulation")
});

/** What a scope opens, in words (the name of the scope when it has none). */
export const scopeLabel = scope => SCOPE_LABELS()[scope] ?? scope;

const LIFETIME_LABELS = () => ({
  30: t("30 days"),
  90: t("90 days"),
  365: t("1 year"),
  0: t("Never expires")
});

/** A few real addresses of the API, each with the scope that opens it. */
const EXAMPLES = [
  ["/api/v1/heroes", "game"],
  ["/api/v1/popular/heroes", "competitive"],
  ["/api/v1/series", "scrims"],
  ["/api/v1/me", "account"]
];

const day = time =>
  new Intl.DateTimeFormat(currentLanguage(), { dateStyle: "medium" }).format(new Date(time));

/** What a key says of its own life: revoked, expired, when it ends, or that it never does. */
function lifeOf(key, now) {
  if (key.revokedAt) {
    return t("Revoked {date}", { date: day(key.revokedAt) });
  }
  if (!key.expiresAt) {
    return t("Never expires");
  }
  return key.expiresAt <= now
    ? t("Expired {date}", { date: day(key.expiresAt) })
    : t("Expires {date}", { date: day(key.expiresAt) });
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { scopeBoxes, secretBox, doc, list, draw, load, create };
