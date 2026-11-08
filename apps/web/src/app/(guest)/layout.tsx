import type React from "react";

/**
 * The guest portal shell (spec 10 §10.6): one booking, no account, nothing from a third
 * party. The page draws the manager's branded header and footer, since the brand comes
 * from the booking it shows.
 */
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background" data-testid="guest-portal">
      {children}
    </div>
  );
}
