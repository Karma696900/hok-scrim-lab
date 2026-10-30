// Measures how big the source files and their functions are, for the architecture test and the script that rewrites its limits.
// A function is counted with everything nested inside it, because a long page factory is exactly what the limits are for.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  "locales",
  "fonts",
  "vod-drafts",
  "migrations",
  "samples"
]);
const isTest = name => /\.(test\.js|e2e\.mjs)$/.test(name);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) {
        yield* walk(join(dir, entry.name));
      }
    } else {
      yield join(dir, entry.name);
    }
  }
}

const posix = path => relative(ROOT, path).split(sep).join("/");
const lineCount = text => text.split("\n").length - (text.endsWith("\n") ? 1 : 0);

/** Source files of the application and of its tools, as repository-relative paths. */
export function sourceFiles(kind) {
  const roots = kind === "css" ? ["src/client/styles"] : ["src", "scripts"];
  const wanted = kind === "css" ? /\.css$/ : /\.(js|mjs)$/;
  const files = [];
  for (const root of roots) {
    for (const path of walk(join(ROOT, root))) {
      const name = path.split(sep).pop();
      if (wanted.test(name) && (kind === "css" || !isTest(name))) {
        files.push(posix(path));
      }
    }
  }
  return files.sort();
}

/** How a function is called in the limits file: its own name, or where it sits when it has none. */
function nameOf(node, parent, enclosing) {
  if (node.id?.name) {
    return node.id.name;
  }
  if (parent?.type === "VariableDeclarator" && parent.id.name) {
    return parent.id.name;
  }
  if ((parent?.type === "Property" || parent?.type === "MethodDefinition") && parent.key?.name) {
    return parent.key.name;
  }
  if (parent?.type === "AssignmentExpression" && parent.left.property?.name) {
    return parent.left.property.name;
  }
  return `(anonyme dans ${enclosing || "le fichier"})`;
}

/** The size, in lines, of every function of a JavaScript source; same-named functions keep the largest. */
export function functionSizes(source) {
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module", locations: true });
  const sizes = new Map();
  const visit = (node, parent, enclosing) => {
    if (!node || typeof node.type !== "string") {
      return;
    }
    let inner = enclosing;
    if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type)) {
      const name = nameOf(node, parent, enclosing);
      const lines = node.loc.end.line - node.loc.start.line + 1;
      sizes.set(name, Math.max(sizes.get(name) || 0, lines));
      inner = name;
    }
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach(child => visit(child, node, inner));
      } else if (value && typeof value.type === "string") {
        visit(value, node, inner);
      }
    }
  };
  visit(ast, null, "");
  return sizes;
}

/** Everything the architecture test checks, as `{ path: { lines, functions: { name: lines } } }`. */
export function measure(kind) {
  const result = {};
  for (const path of sourceFiles(kind)) {
    const text = readFileSync(join(ROOT, path), "utf8");
    const entry = { lines: lineCount(text) };
    if (kind !== "css") {
      entry.functions = Object.fromEntries(functionSizes(text));
    }
    result[path] = entry;
  }
  return result;
}
