import { defineConfig } from "vite";
export default defineConfig({ server: { host: "127.0.0.1", port: 4173, strictPort: true }, preview: { host: "127.0.0.1", port: 4173, strictPort: true }, build: { rollupOptions: { input: { app: new URL("./index.html", import.meta.url).pathname, launch: new URL("./launch.html", import.meta.url).pathname } } } });
