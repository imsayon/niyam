import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(process.cwd(), ".."),
  serverExternalPackages: ["pdfkit", "pdfjs-dist", "xlsx", "@neon/auth", "nodemailer"],
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "X-Frame-Options", value: "DENY" },
    ] }];
  },
};
export default nextConfig;
