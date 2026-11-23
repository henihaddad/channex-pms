"use client";

import { ErrorView } from "@/components/error-view";

/** Any other page (booking site, portals, sign-in) that failed to render. */
export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="px-4">
      <ErrorView {...props} />
    </main>
  );
}
