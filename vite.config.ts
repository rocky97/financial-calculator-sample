import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths, so the build works from a GitHub Pages project URL
  // (https://<user>.github.io/<repo>/) whatever the repository is called.
  base: "./",
});
