import type { ReactNode } from "react";

/** Line icons for the sidebar, 20px, stroke from currentColor. Text labels always accompany them. */
const wrap = (children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="shrink-0"
  >
    {children}
  </svg>
);

export const navIcons = {
  dashboard: wrap(
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
    </>,
  ),
  calendar: wrap(
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>,
  ),
  reservations: wrap(
    <>
      <path d="M3 18V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10" />
      <path d="M3 13h18M7 10h4" />
    </>,
  ),
  inbox: wrap(
    <>
      <path d="M4 5h16v14H4z" />
      <path d="m4 7 8 6 8-6" />
    </>,
  ),
  operations: wrap(
    <>
      <path d="m4 13 4 4L20 5" />
    </>,
  ),
  properties: wrap(
    <>
      <path d="M4 21V5l8-3 8 3v16" />
      <path d="M9 21v-6h6v6M9 9h1M14 9h1M9 13h1M14 13h1" />
    </>,
  ),
  channels: wrap(
    <>
      <path d="M8 12a4 4 0 0 1 4-4h3a4 4 0 0 1 0 8h-1" />
      <path d="M16 12a4 4 0 0 1-4 4H9a4 4 0 0 1 0-8h1" />
    </>,
  ),
  frontDesk: wrap(
    <>
      <path d="M3 20h18M5 20v-7h14v7" />
      <path d="M7 13V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v5" />
    </>,
  ),
  owners: wrap(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M18 20a6 6 0 0 0-3-5.2" />
    </>,
  ),
  reports: wrap(
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>,
  ),
  direct: wrap(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" />
    </>,
  ),
  more: wrap(
    <>
      <circle cx="6" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="18" cy="12" r="1" />
    </>,
  ),
  settings: wrap(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.4a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.4h4l.4-2.4a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
    </>,
  ),
  search: wrap(
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4-4" />
    </>,
  ),
  chevron: wrap(<path d="m9 6 6 6-6 6" />),
};

export type NavIcon = keyof typeof navIcons;
