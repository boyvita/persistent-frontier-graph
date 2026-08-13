import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-lib",
    emptyOutDir: true,
    lib: {
      cssFileName: "styles",
      entry: {
        index: "src/index.ts",
        styles: "src/style-entry.ts",
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        assetFileNames: (asset) => asset.name === "style.css" ? "styles.css" : "[name][extname]",
      },
    },
    sourcemap: true,
  },
});
