// The pages of the public API, part of the table of the pages (routes-table.js): its documentation, public and
// indexed, and the page where a signed-in person makes their keys and connects an AI assistant.
import { message } from "./routes-shared.js";

export const API_ROUTES = [
  {
    // made from the API's own list of addresses (GET /api/v1/openapi.json)
    pattern: /^\/developers$/,
    view: "developers",
    index: true,
    title: message("HOK API — Honor of Kings data for developers and AI assistants | {site}"),
    description: message(
      "Read Honor of Kings Global heroes, items, arcana, spells, the tier list and tournament drafts from your programs, or connect Claude, ChatGPT or Cursor through MCP. Every address, its parameters and an example answer."
    )
  },
  {
    pattern: /^\/me\/api$/,
    view: "me-api",
    index: false,
    title: message("API | {site}"),
    description: message("Your API keys, and how to connect an AI assistant to your data.")
  }
];
