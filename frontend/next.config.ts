import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm run build:static` (IG_EXPORT=1) writes plain files to out/ for the packaged app.
  ...(process.env.IG_EXPORT ? { output: "export" as const, trailingSlash: true } : {}),
  // Both rely on a Next server, so they are off for the static export.
  ...(process.env.IG_EXPORT ? {} : { cacheComponents: true, partialPrefetching: true }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
