import { SessionKeepAlive } from "@/components/session-keep-alive";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { currentSession } from "@/server/session";
import { CleanerApp } from "./cleaner-app";

export async function generateMetadata() {
  const t = await getTranslations("cleaner");
  return { title: t("title") };
}

/** The cleaner PWA (spec 08 §8.7): a phone in a stairwell, offline-tolerant (OPS-6), in the cleaner's language. */
export default async function CleanerPage() {
  const session = await currentSession();
  if (!session) redirect("/login");
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <>
      <SessionKeepAlive />
      {/* the root layout sends only a few namespaces to the client; this screen needs its own */}
      <NextIntlClientProvider locale={locale} messages={{ cleaner: messages.cleaner }}>
        <CleanerApp today={new Date().toISOString().slice(0, 10)} />
      </NextIntlClientProvider>
    </>
  );
}
