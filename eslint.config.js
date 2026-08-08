import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Package dependency boundaries — see docs/decisions/0002-provider-package-boundaries.md
// and docs/decisions/0006-transfer-and-matching-engine-architecture.md.
// Dependency direction: packages/core -> packages/connector-sdk -> packages/providers/<name>
//                       packages/core -> packages/matching -> packages/upf
// packages/* must never depend on apps/* or services/*.

const packagesNeverImportAppsOrServices = {
  files: ["packages/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "@ekusupo/web",
              "@ekusupo/extension",
              "@ekusupo/desktop",
              "@ekusupo/api",
              "@ekusupo/worker",
            ],
            message:
              "packages/* must not depend on apps/* or services/* — dependencies only flow apps/services -> packages.",
          },
        ],
      },
    ],
  },
};

const coreNeverImportsProvidersDirectly = {
  files: ["packages/core/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@ekusupo/provider-*"],
            message:
              "packages/core must never import a provider package directly — go through @ekusupo/connector-sdk.",
          },
        ],
      },
    ],
  },
};

const connectorSdkStaysProviderNeutral = {
  files: ["packages/connector-sdk/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@ekusupo/core", "@ekusupo/provider-*", "@ekusupo/matching"],
            message:
              "packages/connector-sdk defines the contract only — it must not depend on core, matching, or on any specific provider.",
          },
        ],
      },
    ],
  },
};

const providersNeverImportCoreDirectly = {
  files: ["packages/providers/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@ekusupo/core", "@ekusupo/matching"],
            message:
              "provider packages implement @ekusupo/connector-sdk and must not depend on @ekusupo/core or @ekusupo/matching directly.",
          },
        ],
      },
    ],
  },
};

// packages/upf is the leaf of the dependency graph (ADR-0004) — nothing it
// exports may depend on connector-sdk, core, matching, or any provider.
const upfStaysLeaf = {
  files: ["packages/upf/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "@ekusupo/core",
              "@ekusupo/connector-sdk",
              "@ekusupo/provider-*",
              "@ekusupo/matching",
            ],
            message:
              "packages/upf is the dependency graph's leaf — it must not depend on core, connector-sdk, matching, or any provider.",
          },
        ],
      },
    ],
  },
};

// packages/matching depends only on packages/upf (ADR-0006) — it must never
// depend on connector-sdk, core, or any provider.
const matchingStaysLeafLike = {
  files: ["packages/matching/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@ekusupo/core", "@ekusupo/connector-sdk", "@ekusupo/provider-*"],
            message:
              "packages/matching must not depend on core, connector-sdk, or any provider — it only depends on @ekusupo/upf.",
          },
        ],
      },
    ],
  },
};

// apps/extension is the first React code in the repo — see docs/browser-extension.md and ADR-0007.
const browserExtensionReactRules = {
  files: ["apps/extension/**/*.{ts,tsx}"],
  plugins: {
    "react-hooks": reactHooks,
    "react-refresh": reactRefresh,
  },
  rules: {
    ...reactHooks.configs["recommended-latest"].rules,
    ...reactRefresh.configs.vite.rules,
  },
};

// Extension context boundaries — see docs/browser-extension.md "Context
// boundaries" and ADR-0008. background/ is deliberately unrestricted: it's
// the only context allowed to import @ekusupo/core, @ekusupo/connector-sdk,
// and @ekusupo/provider-* (starting PR5).
const extensionContentStaysThin = {
  files: ["apps/extension/src/content/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@ekusupo/*"],
            message:
              "content/ must not depend on any @ekusupo/* package directly — message background instead.",
          },
        ],
      },
    ],
  },
};

const extensionPopupStaysThin = {
  files: ["apps/extension/src/popup/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@ekusupo/*"],
            message:
              "popup/ must not depend on any @ekusupo/* package directly — message background instead.",
          },
        ],
      },
    ],
  },
};

/**
 * options/ never had this rule stated for it before now — a gap noticed
 * while wiring real OAuth here (ADR-0020). It talks to `chrome.identity`
 * and `background` only, exactly like content/popup already do; it
 * never needed a provider package import and shouldn't gain one later
 * without a deliberate decision.
 */
const extensionOptionsStaysThin = {
  files: ["apps/extension/src/options/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@ekusupo/*"],
            message:
              "options/ must not depend on any @ekusupo/* package directly — message background instead.",
          },
        ],
      },
    ],
  },
};

const extensionSharedStaysLeaf = {
  files: ["apps/extension/src/shared/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@ekusupo/*", "../popup/*", "../background/*", "../content/*"],
            message:
              "shared/ must stay a leaf — it must not depend on @ekusupo/* packages or reach into a sibling extension context.",
          },
        ],
      },
    ],
  },
};

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/out/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  packagesNeverImportAppsOrServices,
  coreNeverImportsProvidersDirectly,
  connectorSdkStaysProviderNeutral,
  providersNeverImportCoreDirectly,
  upfStaysLeaf,
  matchingStaysLeafLike,
  browserExtensionReactRules,
  extensionContentStaysThin,
  extensionPopupStaysThin,
  extensionOptionsStaysThin,
  extensionSharedStaysLeaf,
  eslintConfigPrettier,
);
