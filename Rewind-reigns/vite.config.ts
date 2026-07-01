import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webPort = Number(process.env.REWIND_WEB_PORT ?? 5174);
const apiUrl = process.env.REWIND_API_URL ?? `http://127.0.0.1:${process.env.REWIND_API_PORT ?? 3001}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": apiUrl
    }
  }
});
