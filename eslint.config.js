import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/",
      "node_modules/",
      "src/public/locales/",
      "docs/",
      "backups/",
      ".claude/",
      ".agents/",
      ".impeccable/",
      ".superpowers/",
      ".data/",
      "modèles/"
    ]
  },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: {
      curly: ["error", "all"],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      "no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true
        }
      ],
      // The validators reject control characters in user text on purpose.
      "no-control-regex": "off"
    }
  },
  // The browser app.
  { files: ["src/client/**/*.js"], languageOptions: { globals: globals.browser } },
  // Code that runs in both the browser and Node.
  {
    files: ["src/shared/**/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } }
  },
  // The server and the tools.
  {
    files: [
      "src/server/**/*.js",
      "scripts/**/*.{js,mjs}",
      "src/testing/**/*.{js,mjs}",
      "src/**/*.test.js"
    ],
    languageOptions: { globals: globals.node }
  },
  // Node files that also hand functions to a headless browser (`page.evaluate`): the browser globals are legitimate there.
  {
    files: [
      "src/server/platform/http/prerender*.js",
      "src/server/features/heroes/sync/hero-sync.js",
      "src/**/*.e2e.mjs",
      "scripts/performance/*.mjs",
      "scripts/dev/*.mjs"
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  }
];
