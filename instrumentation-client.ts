import * as Sentry from "@sentry/nextjs";

// Without a DSN, Sentry does nothing, so local development needs no setup.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Session replay is not enabled: workspace content (docs, canvas) is private user data.
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;