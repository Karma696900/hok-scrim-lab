// How to connect an AI assistant to the API: the MCP server (/api/v1/mcp) for Claude Code, Claude Desktop and
// Cursor, the OpenAPI description (/api/v1/openapi.json) for a custom GPT of ChatGPT. Shown on the API page of a
// signed-in person and on the public documentation; each snippet carries the address of this site and a
// placeholder where the key goes (the key itself is never written into a page).
import { t } from "../../app/browser-i18n.js";
import { icon } from "../../../shared/icons.js";

export const KEY_PLACEHOLDER = "hok_YOUR_KEY";

/** The assistants and what to paste where, for the site at `origin`. */
export function aiClients(origin) {
  const mcp = `${origin}/api/v1/mcp`;
  const json = value => JSON.stringify(value, null, 2);
  return [
    {
      id: "claude-code",
      name: "Claude Code",
      file: "Terminal",
      where: t("Run this in a terminal:"),
      code: `claude mcp add --transport http hok-api ${mcp} --header "Authorization: Bearer ${KEY_PLACEHOLDER}"`
    },
    {
      id: "claude-desktop",
      name: "Claude Desktop",
      file: "claude_desktop_config.json",
      where: t(
        "Add this to claude_desktop_config.json (Settings, Developer, Edit config), then restart Claude. It needs Node.js."
      ),
      code: json({
        mcpServers: {
          "hok-api": {
            command: "npx",
            args: ["-y", "mcp-remote", mcp, "--header", "Authorization:${HOK_API_KEY}"],
            env: { HOK_API_KEY: `Bearer ${KEY_PLACEHOLDER}` }
          }
        }
      })
    },
    {
      id: "cursor",
      name: "Cursor",
      file: ".cursor/mcp.json",
      where: t("Add this to .cursor/mcp.json, in your project or in your home folder:"),
      code: json({
        mcpServers: {
          "hok-api": { url: mcp, headers: { Authorization: `Bearer ${KEY_PLACEHOLDER}` } }
        }
      })
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      file: "OpenAPI",
      where: t(
        "In a custom GPT: Configure, Create new action, Import from URL with this address. Then Authentication: API key, type Bearer, and paste your key."
      ),
      code: `${origin}/api/v1/openapi.json`
    }
  ];
}

/** A block of code with its title and a button that copies it. */
export const codeFigure = (esc, title, code, id = "") =>
  `<figure class="api-code"${id ? ` id="${esc(id)}"` : ""}><figcaption><b>${esc(title)}</b><button type="button" class="btn btn--ghost btn--sm" data-copy>${icon("copy", "i--sm")}${t("Copy")}</button></figcaption><pre><code>${esc(code)}</code></pre></figure>`;

/** The section that connects the assistants. */
export function aiSetupHtml(esc, origin) {
  return `<p class="api-advice">${icon("info", "i--sm")}<span>${t(
    "Make one key for each assistant, with only what it needs (the public data of the game is enough to ask about heroes, items and drafts). If one leaks, revoke it without touching the others."
  )}</span></p>
    <div class="api-ai">${aiClients(origin)
      .map(
        client =>
          `<section class="api-ai__client" data-ai="${client.id}"><h3>${esc(client.name)}</h3><p class="muted">${esc(client.where)}</p>${codeFigure(esc, client.file, client.code)}</section>`
      )
      .join("")}</div>
    <p class="muted api-ai__then">${t("Replace {key} with your key. The assistant then sees one tool per address your key can read, and only reads.", { key: `<code>${KEY_PLACEHOLDER}</code>` })}</p>`;
}
