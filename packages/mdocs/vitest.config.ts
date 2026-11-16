import { playwright } from "@vitest/browser-playwright";
import { defineConfig, type ViteUserConfig } from "vitest/config";

// Chromium locally and in CI, on Linux and Windows; another engine on demand
// (`MIRA_BROWSER=firefox bun run test`).
// Never set it to the empty string: the `??` below does not fall back through one,
// and vitest then reports an instance it does not have.
type PlaywrightBrowser = "chromium" | "firefox" | "webkit";
const browser = (process.env.MIRA_BROWSER ?? "chromium") as PlaywrightBrowser;

const config: ViteUserConfig = defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
          exclude: ["**/*.browser.test.ts", "**/*.browser.test.tsx"],
          globalSetup: ["tests/setup/build-fixture.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["tests/**/*.browser.test.tsx"],
          // `react-dom/static` is the entry that matters and the one nothing else
          // would have told you about. Left off, it resolves to the raw CJS build,
          // drags in a second copy of React, and every hook under it reads its
          // dispatcher as `null` — an `Invalid hook call` whose stack points at
          // library code that is perfectly fine.
          deps: {
            optimizer: {
              web: {
                include: ["react", "react-dom", "react-dom/client", "react-dom/static"],
              },
            },
          },
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            screenshotFailures: false,
            instances: [{ browser }],
          },
        },
      },
    ],
  },
});

export default config;
