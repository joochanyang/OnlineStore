import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "node_modules/**",
      "**/node_modules/**",
      ".next/**",
      "**/.next/**",
      "dist/**",
      "**/dist/**",
      "build/**",
      "**/build/**",
      "packages/db/generated/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
];
