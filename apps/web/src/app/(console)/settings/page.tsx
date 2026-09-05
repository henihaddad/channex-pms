import { redirect } from "next/navigation";

/** The settings hub opens on the organization tab. */
export default function SettingsPage() {
  redirect("/settings/organization");
}
