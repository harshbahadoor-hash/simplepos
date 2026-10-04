import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { serviceWorkerPlugin } from "./build/service-worker-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerPlugin()],
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
