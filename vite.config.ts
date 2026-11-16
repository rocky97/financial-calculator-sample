import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths, so the build works from a GitHub Pages project URL
  // (https://<user>.github.io/<repo>/) whatever the repository is called.
  base: "./",
  // GitHub Pages serves master → /docs. The build is committed there.
  build: { outDir: "docs", emptyOutDir: true },
});
