"use client";

import { ErrorView } from "@/components/error-view";

/** A console page that failed keeps the shell around it, so the host can go somewhere else. */
export default function ConsoleError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView {...props} home="/" homeLabel="backToToday" />;
}
