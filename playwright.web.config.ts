import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/web",
  workers: 1,
  timeout: 30000,
  use: {
    channel: "msedge",
    baseURL: "http://127.0.0.1:8080",
    trace: "retain-on-failure",
  },
  reporter: "list",
});
