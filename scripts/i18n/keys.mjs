// Collects every translation key used by the code: t("…") calls in the browser and server code, and
// {{t:…}} in the HTML shell. Used by src/shared/i18n.test.js and by `npm run i18n`.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as acorn from "acorn";
import * as walk from "acorn-walk";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE_DIRECTORIES = ["src/client", "src/shared", "src/server"];
const SKIP = new Set(["locales", "fonts", "icons", "migrations", "dist"]); // dist = minified bundles of the same sources: only false keys (renamed local functions)

function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) {
        yield* files(path.join(directory, entry.name));
      }
    } else if (/\.(js|mjs)$/.test(entry.name)) {
      yield path.join(directory, entry.name);
    }
  }
}

/** Names of the functions whose first argument is a translation key. */
const TRANSLATORS = new Set(["t", "tr", "message", "say", "issue"]);

export function collectKeys() {
  const keys = new Map(); // key → first "file:line"
  const add = (key, where) => {
    if (!keys.has(key)) {
      keys.set(key, where);
    }
  };
  for (const directory of SOURCE_DIRECTORIES) {
    for (const file of files(path.join(ROOT, directory))) {
      if (path.basename(file) === "i18n.js") {
        continue;
      } // the translation cores themselves
      const source = readFileSync(file, "utf8");
      const ast = acorn.parse(source, {
        ecmaVersion: "latest",
        sourceType: "module",
        locations: true
      });
      walk.simple(ast, {
        CallExpression(node) {
          const name = node.callee.type === "Identifier" ? node.callee.name : null;
          if (!name || !TRANSLATORS.has(name)) {
            return;
          }
          // tr(language, key, params) on the server, t(key, params) in the browser
          const argument = name === "tr" ? node.arguments[1] : node.arguments[0];
          if (argument?.type === "Literal" && typeof argument.value === "string") {
            add(argument.value, `${path.relative(ROOT, file)}:${node.loc.start.line}`);
          } else if (argument?.type === "TemplateLiteral" && !argument.expressions.length) {
            add(
              argument.quasis[0].value.cooked,
              `${path.relative(ROOT, file)}:${node.loc.start.line}`
            );
          }
        },
        // Errors carry their English message as the key: new DomainError("…", params),
        // badRequest("…", code, params)…
        NewExpression(node) {
          errorKey(node, file, add);
        }
      });
      walk.simple(ast, {
        CallExpression(node) {
          errorKey(node, file, add);
        }
      });
    }
  }
  const shell = readFileSync(path.join(ROOT, "src/client/index.html"), "utf8");
  for (const match of shell.matchAll(/\{\{t:([^}]+)\}\}/g)) {
    add(match[1], "src/client/index.html");
  }
  return keys;
}

const ERROR_FACTORIES = new Set([
  "badRequest",
  "unauthorized",
  "forbidden",
  "notFound",
  "conflict",
  "tooMany",
  "DomainError"
]);

/** The literal texts an argument can take (a conditional offers two). */
function literals(node) {
  if (!node) {
    return [];
  }
  if (node.type === "Literal" && typeof node.value === "string") {
    return [node.value];
  }
  if (node.type === "TemplateLiteral" && !node.expressions.length) {
    return [node.quasis[0].value.cooked];
  }
  if (node.type === "ConditionalExpression") {
    return [...literals(node.consequent), ...literals(node.alternate)];
  }
  return [];
}

function errorKey(node, file, add) {
  const name = node.callee.type === "Identifier" ? node.callee.name : null;
  if (!name || (!ERROR_FACTORIES.has(name) && name !== "HttpError")) {
    return;
  }
  const argument = name === "HttpError" ? node.arguments[2] : node.arguments[0];
  for (const text of literals(argument)) {
    add(text, `${path.relative(ROOT, file)}:${node.loc.start.line}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const keys = collectKeys();
  console.log(`${keys.size} keys`);
  if (process.argv.includes("--list")) {
    for (const [key, where] of keys) {
      console.log(`${where}\t${key}`);
    }
  }
}
