// casino page, the basket's side panel (owner, 2026-11-07): a <dialog> on the side of the screen, outside the roulette
// (a live change of the roulette draws the page again; the panel stays open). It lists the kept compositions, renames
// and removes them, and downloads them all in one PDF.
import { t } from "../../app/browser-i18n.js";
import {
  basketMarkup,
  basketRequest,
  readBasket,
  removeFromBasket,
  renameInBasket
} from "./casino-basket.js";

let dialog = null;

// the counts on the page's Basket buttons
const recount = view => {
  const count = String(readBasket().length);
  for (const badge of view.root?.querySelectorAll(".casino-count") ?? []) {
    badge.textContent = count;
  }
};

const draw = view => {
  dialog.innerHTML = basketMarkup(view, readBasket(), view.heroes());
  recount(view);
};

async function download(view, button) {
  const label = button.innerHTML;
  button.disabled = true;
  button.textContent = t("Generating…");
  try {
    const response = await fetch("/api/casino/pdf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(basketRequest(readBasket()))
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      throw new Error(
        failure?.error || t("Export failed ({status}).", { status: response.status })
      );
    }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download =
      response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ||
      "hok-compositions.pdf";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    view.tell(t("{format} ready · {file}", { format: "PDF", file: link.download }));
  } catch (error) {
    view.tell(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = label;
  }
}

/** Opens the panel on the basket of this browser. */
export function openBasket(view) {
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "casino-basket";
    dialog.setAttribute("aria-label", t("Basket"));
    document.body.append(dialog);
    dialog.addEventListener("click", event => {
      if (event.target === dialog) {
        dialog.close();
        return;
      }
      const button = event.target.closest("[data-action]");
      const action = button?.dataset.action;
      if (action === "casino-basket-close") {
        dialog.close();
      } else if (action === "casino-basket-remove") {
        removeFromBasket(button.dataset.basketId);
        draw(dialog.view);
      } else if (action === "casino-basket-pdf") {
        download(dialog.view, button);
      }
    });
    dialog.addEventListener("change", event => {
      if (event.target.name === "casino-basket-name") {
        renameInBasket(event.target.dataset.basketId, event.target.value);
      }
    });
  }
  dialog.view = view;
  draw(view);
  if (!dialog.open) {
    dialog.showModal();
  }
}

/** Closes the panel (another page opens). */
export function closeBasket() {
  if (dialog?.open) {
    dialog.close();
  }
}

/** The page's Basket counts, after a composition was added. */
export const basketChanged = view => recount(view);
