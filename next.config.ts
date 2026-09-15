import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The end-to-end suite builds into a directory of its own (see
  // playwright.config.ts), so running it never rebuilds `.next` out from under
  // a dev server someone has open.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
