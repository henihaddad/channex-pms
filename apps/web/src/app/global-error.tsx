"use client";

/**
 * The root layout itself failed, so there is no translation provider and no stylesheet guarantee:
 * a plain page in English with one way out.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "4rem 1rem" }}>
        <main style={{ maxWidth: "32rem", margin: "0 auto" }}>
          <h1 style={{ fontSize: "1.5rem" }}>Something went wrong</h1>
          <p>OTAbridge did not load. Nothing you saved was lost.</p>
          <button type="button" onClick={reset} style={{ padding: "0.5rem 1rem" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
