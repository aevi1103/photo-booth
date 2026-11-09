import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3210",
    browserName: "chromium",
    channel: "chrome",
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3210",
    url: "http://127.0.0.1:3210",
    reuseExistingServer: false,
    env: {
      NEXT_TEST_DIST_DIR: ".next-test-configured",
      SUPABASE_URL: "http://127.0.0.1:9999",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
      SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      APP_URL: "http://127.0.0.1:3210",
    },
  },
});
