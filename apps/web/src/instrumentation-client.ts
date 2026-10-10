/** Browser error monitoring. Only active when NEXT_PUBLIC_SENTRY_DSN is set. No session replay, no PII. */
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.05,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
