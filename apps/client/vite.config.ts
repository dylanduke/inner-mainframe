import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@inner-mainframe/game-logic": path.resolve(__dirname, "../../packages/game-logic/src"),
      "@inner-mainframe/net-protocol": path.resolve(__dirname, "../../packages/net-protocol/src"),
    },
  },
});
