// Changing the board in place: only what differs from what is shown is written.

export const patch = (element, html) => {
  if (element.dataset.html !== html) {
    element.innerHTML = html;
    element.dataset.html = html;
  }
};

export const setText = (element, text) => {
  if (element.textContent !== text) {
    element.textContent = text;
  }
};

export const setClass = (element, name, on) => {
  if (element.classList.contains(name) !== on) {
    element.classList.toggle(name, on);
  }
};
