import Script from "next/script";

/** Privacy-friendly analytics (Plausible). No cookies, no ads, no personal data. */
export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return null;
  return <Script defer data-domain={domain} src="https://plausible.io/js/script.js" strategy="afterInteractive" />;
}
