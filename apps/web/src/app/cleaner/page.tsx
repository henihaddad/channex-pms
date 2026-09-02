import { redirect } from "next/navigation";
import { currentSession } from "@/server/session";
import { CleanerApp } from "./cleaner-app";

/** The cleaner PWA (spec 08 §8.7): a phone in a stairwell, offline-tolerant (OPS-6). */
export default async function CleanerPage() {
  const session = await currentSession();
  if (!session) redirect("/login");
  return <CleanerApp today={new Date().toISOString().slice(0, 10)} />;
}
