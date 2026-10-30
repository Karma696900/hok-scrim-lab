import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../../..");

/**
 * The folders the browser gets its files from. Everything that reaches the web is listed here,
 * nothing else is served.
 */
export const WEB = {
  root,
  /**
   * The application's own code and styles. Served as they are while developing; the production
   * bundle replaces them.
   */
  client: path.join(root, "src", "client"),
  /**
   * Code that the server and the browser both run (the route table, the translation core, the draft
   * rules...).
   */
  shared: path.join(root, "src", "shared"),
  /** Fonts, icons, pictures and the generated translation catalogs. Served untouched. */
  public: path.join(root, "src", "public"),
  /** The minified, content-hashed bundle written by `npm run build`. */
  dist: path.join(root, "dist")
};
