// The three pages of the data of the game: /items, /arcana and /spells. Public (no account), read-only: what
// the staff entered in the catalogue. A stage opens each page (the cover of a hero, the title, three big tabs
// with how many pieces each section holds), then three columns: the filters, the grid of pieces with their
// picture, their cost and their two main stats, and the sheet of the piece that was clicked, which stays in
// view. Nothing is invented: a number nobody entered (the cooldown of a spell, a price) is simply not shown.

export const SECTIONS = ["items", "arcana", "spells"];
