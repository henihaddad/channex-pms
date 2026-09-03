import type React from "react";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { RTL_LOCALES } from "@/i18n/request";
import { UiProvider } from "@/components/ui/provider";
import "./globals.css";

// Self-hosted (BE-11: no third-party requests). Bricolage Grotesque for titles, Manrope for the interface.
const display = localFont({
  src: "./fonts/bricolage-grotesque-latin.woff2",
  variable: "--font-display",
  weight: "200 800",
  display: "swap",
});
const body = localFont({
  src: "./fonts/manrope-latin.woff2",
  variable: "--font-body",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "OTAbridge", template: "%s · OTAbridge" },
  description:
    "Property management and channel manager for people who manage properties for other people.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      dir={RTL_LOCALES.has(locale) ? "rtl" : "ltr"}
      className={`light h-full antialiased ${display.variable} ${body.variable}`}
      data-theme="light"
    >
      <body className="min-h-full bg-background text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <UiProvider locale={locale}>{children}</UiProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
