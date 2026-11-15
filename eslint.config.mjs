// Flat config for ESLint 10 (no eslint.config.* existed → `pnpm lint` was broken).
// Scope: JS/MJS files only — espree cannot parse TypeScript, and typescript-eslint
// hard-gates on TS < 7 (project uses TS 7.0.2; upstream issue #10940).
// tsc --noEmit owns TS correctness; this catches structure/syntax in scripts.
// ponytail: JS-only lint — enable typescript-eslint configs when they support TS ≥7.1
const NODE_GLOBALS = {
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  fetch: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  queueMicrotask: "readonly",
  AbortController: "readonly",
  TextEncoder: "readonly",
  TextDecoder: "readonly",
  crypto: "readonly",
  structuredClone: "readonly",
  // page.evaluate() callbacks run in the renderer's browser context
  window: "readonly",
  document: "readonly",
  WebSocket: "readonly",
  navigator: "readonly",
  location: "readonly",
  localStorage: "readonly",
  HTMLElement: "readonly",
  KeyboardEvent: "readonly",
  Event: "readonly",
};

export default [
  {
    ignores: [
      "out/**",
      "release/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "pnpm-lock.yaml",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: NODE_GLOBALS,
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-undef": "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-implicit-globals": "error",
      "no-throw-literal": "error",
    },
  },
];
