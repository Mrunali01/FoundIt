import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3107", trace: "retain-on-failure" },
  webServer: {
    env: { FOUNDIT_MODE: "demo", FOUNDIT_DEMO_NAMESPACE: `e2e-${Date.now()}` },
    command: "npm run dev -- --port 3107",
    url: "http://127.0.0.1:3107",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
