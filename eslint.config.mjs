import obsidianmd from "eslint-plugin-obsidianmd";

// ESLint v9 flat config — der lokale Spiegel des Community-Store-Scanners.
export default [
  {
    ignores: [
      "main.js",
      "coverage/**",
      "node_modules/**",
      "tests/**",
      ".remember/**",
      "docs/**",
      "*.config.mjs",
      "*.config.ts",
      "*.config.js",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.build.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // display()/setWarning() sind ab 1.13 deprecated; Koda haelt minAppVersion 1.8.7
    // und braucht den display()-Fallback deshalb bewusst (wie kuro-gamification).
    // confirm.ts ist verbatim aus obsidian-kit vendored (nie von Hand editieren).
    files: ["src/obsidian/settings.ts", "src/vendor/kit-obsidian/confirm.ts"],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
    },
  },
];
