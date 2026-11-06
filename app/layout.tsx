import type { Metadata } from "next";
import { readSiteConfig } from "../lib/site-config.mjs";
import "./globals.css";

const config = readSiteConfig();
const title = "Tavrik — Know what changed. Keep the setup that worked.";
const description = "Configuration history for ROS 2 manipulation teams. Compare grippers, firmware, calibration, policies, and dataset versions in a working synthetic prototype.";

export const metadata: Metadata = {
  title,
  description,
  ...(config.siteUrl ? { metadataBase: new URL(config.siteUrl), alternates: { canonical: "/" } } : {}),
  robots: { index: config.launchReady, follow: config.launchReady },
  openGraph: { title, description, type: "website", locale: "en_US", ...(config.siteUrl ? { url: config.siteUrl } : {}) },
  twitter: { card: "summary", title, description },
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
