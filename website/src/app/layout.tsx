import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OTAbridge: property management for people who manage properties for other people",
  description:
    "Fair-code, self-hostable property management system and channel manager for short-term rental managers and independent hotels, built on the Channex.io connectivity API.",
  metadataBase: new URL("https://otabridge.com"),
  openGraph: {
    title: "OTAbridge",
    description:
      "Channel manager, reservations, turnover operations, unified inbox, owner statements and a direct booking engine. Fair-code, self-hostable, built on Channex.io.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
