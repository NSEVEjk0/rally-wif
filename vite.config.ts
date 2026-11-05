import { defineConfig } from "vite";
export default defineConfig({ build: { rollupOptions: { input: { app: new URL("./index.html", import.meta.url).pathname, launch: new URL("./launch.html", import.meta.url).pathname } } } });
