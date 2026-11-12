import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: { dynamic: 30 },
  },
  // Clerk serves user avatars from here (shown on the workspace board cards).
  images: {
    remotePatterns: [{ protocol: "https", hostname: "img.clerk.com" }],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Source maps are uploaded only when SENTRY_AUTH_TOKEN is set (e.g. on Vercel).
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
});