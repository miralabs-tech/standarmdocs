import { defineConfig } from "@standarx/mdocs/config";

export default defineConfig({
  contentDir: "content",
  demosDir: "demos",
  apiDir: "api",
  siteName: "Locales Fixture",
  base: "/docs/",
  locales: ["en", "fr"],
  categories: [{ slug: "guide", label: "Guide" }],
  stylesheets: ["@standarx/mdocs/styles/docs.css"],
});
