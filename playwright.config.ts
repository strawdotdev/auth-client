import { defineConfig } from "@playwright/test";
// The example answers on two origins under one domain (one.auth.test, two.auth.test), which share
// its session cookie as an organization's apps do; Chromium resolves them to this machine.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://one.auth.test:8099",
    headless: true,
    actionTimeout: 10000,
    launchOptions: { args: ["--host-resolver-rules=MAP *.auth.test 127.0.0.1"] },
  },
  workers: 1,
});
