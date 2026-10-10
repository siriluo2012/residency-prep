import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { Analytics } from "@/components/analytics";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Residency Prep", template: "%s · Residency Prep" },
  description:
    "Free, ad-free preparation for USMLE Step 1, Step 2 CK, OET Medicine, and ECFMG certification. Physician-reviewed questions, flashcards, and animated concept explainers.",
  openGraph: { type: "website", siteName: "Residency Prep" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6">{children}</main>
        <footer className="border-t border-border text-xs text-muted-foreground py-6">
          <div className="max-w-6xl mx-auto px-4 flex flex-wrap gap-4 justify-between">
            <span>Residency Prep is independent and not affiliated with USMLE, NBME, FSMB, ECFMG, or OET.</span>
            <span>Content is for exam preparation, not medical advice.</span>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
