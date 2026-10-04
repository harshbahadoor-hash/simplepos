import { defineConfig, devices } from "@playwright/test";

const PORT = 4317;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: 'samsung-sm-x230',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 722 }, hasTouch: true, deviceScaleFactor: 1.5 },
    },
    {
      name: "tablet-landscape",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1340, height: 800 }, hasTouch: true },
    },
    {
      name: "phone-portrait",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
