import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-dom/client"],
          "supabase-vendor": ["@supabase/supabase-js"],
        },
      },
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
