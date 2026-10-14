/** The Eikon mark: a softly rounded frame holding a stylised arch and sun. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="eikon-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8a5c" />
          <stop offset="0.5" stopColor="#d4418e" />
          <stop offset="1" stopColor="#5b3cc4" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#eikon-logo-bg)" />
      <path
        d="M18 48V30a14 14 0 0 1 28 0v18"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="32" cy="31" r="5.5" fill="#fff" />
    </svg>
  );
}
