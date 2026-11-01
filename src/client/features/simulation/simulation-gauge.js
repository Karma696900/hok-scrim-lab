// The gauge a hero shows in place of mana, as the bots service sends it (`hero.gauge`, hok-bots gauges.js): mana as
// a blue bar for most heroes, nothing for Arthur and Ata, a coloured bar (Lian Po red, Lu Bu yellow, Guan Yu white
// then yellow, Li Xin yellow turning red...) or pips (Charlotte, Fatih, Musashi, Fuzi, Yao, Devara, Butterfly,
// Mayene). It paints into the `.sim-bar--mana` element the cards, the heads over the heroes and the spectator's
// rows already hold; the colours are in simulation-gauge.css, by `data-tone`.
const TONES = new Set([
  "mana",
  "red",
  "yellow",
  "white",
  "green",
  "purple",
  "grey",
  "pale-yellow",
  "pale-blue"
]);
const tone = name => (TONES.has(name) ? name : "grey");
const percent = share => Math.max(0, Math.min(100, Math.round((Number(share) || 0) * 100)));

/** The gauge of `hero`; from its mana when the service sends no gauge (an older service). */
export function gaugeOf(hero) {
  if (hero.gauge !== undefined) {
    return hero.gauge;
  }
  if (hero.mana === null || hero.mana === undefined) {
    return null;
  }
  return { kind: "bar", share: hero.maxMana > 0 ? hero.mana / hero.maxMana : 0, tone: "mana" };
}

function paintPips(bar, pips) {
  const key = pips.map(p => (p ? tone(p) : "")).join(",");
  if (bar.dataset.pips === key) {
    return;
  }
  bar.dataset.pips = key;
  bar.classList.add("is-pips");
  bar.removeAttribute("data-tone");
  bar.replaceChildren(
    ...pips.map(p => {
      const pip = document.createElement("b");
      if (p) {
        pip.dataset.tone = tone(p);
      }
      return pip;
    })
  );
}

function paintBar(bar, gauge) {
  if (bar.classList.contains("is-pips") || !bar.firstElementChild) {
    bar.classList.remove("is-pips");
    delete bar.dataset.pips;
    bar.replaceChildren(document.createElement("i"));
  }
  const fill = bar.firstElementChild;
  const p = String(percent(gauge.share));
  if (fill.dataset.p !== p) {
    fill.dataset.p = p;
    fill.style.setProperty("--p", p);
  }
  const from = tone(gauge.tone);
  if (bar.dataset.tone !== from) {
    bar.dataset.tone = from;
  }
  if (gauge.to) {
    bar.dataset.to = tone(gauge.to);
    bar.style.setProperty("--blend", String(percent(gauge.blend)));
  } else if (bar.dataset.to) {
    delete bar.dataset.to;
    bar.style.removeProperty("--blend");
  }
}

/** Paints `hero`'s gauge into `bar` (a `.sim-bar--mana`); hidden when the hero has none. */
export function paintGauge(bar, hero) {
  if (!bar) {
    return;
  }
  const gauge = gaugeOf(hero);
  bar.hidden = !gauge;
  if (!gauge) {
    return;
  }
  if (gauge.kind === "pips" && Array.isArray(gauge.pips)) {
    paintPips(bar, gauge.pips);
  } else {
    paintBar(bar, gauge);
  }
}
