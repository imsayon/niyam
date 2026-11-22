import type { NextConfig } from "next";
import path from "node:path";
const legacyOrigin = process.env.NIYAM_LEGACY_API_ORIGIN;
// Explicitly refuse remote/prod proxies while the old API is being replaced.
if (legacyOrigin && !/^http:\/\/(localhost|127\.0\.0\.1):[0-9]{2,5}$/.test(legacyOrigin)) {
  throw new Error("NIYAM_LEGACY_API_ORIGIN must be a loopback HTTP origin");
}
const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(process.cwd(), ".."),
  async rewrites() {
    return {
      beforeFiles: [],
      // AfterFiles preserves native /api/health and /api/releases, while
      // the catch-all page cannot swallow still-unmigrated /api routes.
      afterFiles: legacyOrigin ? [{ source: "/api/:path*", destination: legacyOrigin + "/api/:path*" }] : [],
      fallback: [],
    };
  },
};
export default nextConfig;
