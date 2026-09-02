import type React from "react";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { RTL_LOCALES } from "@/i18n/request";
import "./globals.css";

export const metadata: Metadata = {
  title: "Channex PMS",
  description: "Property management system and channel manager.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      dir={RTL_LOCALES.has(locale) ? "rtl" : "ltr"}
      className="h-full antialiased"
    >
      <body className="min-h-full bg-slate-50 text-slate-900">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
