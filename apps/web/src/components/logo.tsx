/**
 * The OTAbridge mark: the tile grid of the landing site (an availability grid
 * seen from above) on the mint-to-sky gradient. The wordmark sets "OTA" in the
 * same gradient and "bridge" in the surrounding text colour.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={className}
      focusable="false"
    >
      <defs>
        <linearGradient id="otab-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#otab-g)" />
      <g fill="#0b1020">
        <rect x="12" y="13" width="11" height="11" rx="3" />
        <rect x="26.5" y="13" width="11" height="11" rx="3" />
        <rect x="41" y="13" width="11" height="11" rx="3" />
        <rect x="12" y="26.5" width="11" height="11" rx="3" opacity=".45" />
        <rect x="26.5" y="26.5" width="25.5" height="11" rx="3" />
        <rect x="12" y="40" width="25.5" height="11" rx="3" />
        <rect x="41" y="40" width="11" height="11" rx="3" opacity=".45" />
      </g>
    </svg>
  );
}

export function Wordmark({ className, suffix }: { className?: string; suffix?: string }) {
  return (
    <span className={`font-display text-[1.05rem] leading-none font-bold ${className ?? ""}`}>
      <span className="bridge-text">OTA</span>
      <span>bridge</span>
      {suffix ? <span className="text-muted font-medium"> · {suffix}</span> : null}
    </span>
  );
}

export function Logo({
  size = 28,
  suffix,
  className,
}: {
  size?: number;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark size={size} />
      <Wordmark suffix={suffix} />
    </span>
  );
}
