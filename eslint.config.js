import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

// Package dependency boundaries — see docs/decisions/0002-provider-package-boundaries.md
// Dependency direction: packages/core -> packages/connector-sdk -> packages/providers/<name>
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
            group: ["@ekusupo/core", "@ekusupo/provider-*"],
            message:
              "packages/connector-sdk defines the contract only — it must not depend on core or on any specific provider.",
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
            group: ["@ekusupo/core"],
            message:
              "provider packages implement @ekusupo/connector-sdk and must not depend on @ekusupo/core directly.",
          },
        ],
      },
    ],
  },
};

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.tsbuildinfo", "**/coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  packagesNeverImportAppsOrServices,
  coreNeverImportsProvidersDirectly,
  connectorSdkStaysProviderNeutral,
  providersNeverImportCoreDirectly,
  eslintConfigPrettier,
);
