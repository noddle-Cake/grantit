import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "grantit",
    compatibilityDate: "2026-11-04",
    observability: {
      enabled: true,
    },
    // Client-side routing: unknown paths serve index.html
    assets: {
      notFoundHandling: "single-page-application",
    },
    // Production traffic only; Cloudflare creates the DNS record and certificate on deploy.
    domains: ["grantit.joseyandco.com"],
  },
});
