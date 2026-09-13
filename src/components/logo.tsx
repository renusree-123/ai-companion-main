export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <span
      className="brand-mark"
      style={{ width: size, height: size, minWidth: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width="64%" height="64%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="studymate-spark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#fb923c" />
          </linearGradient>
        </defs>
        <polygon points="12,5 3,9.5 12,14 21,9.5" fill="#fff" />
        <rect x="8.3" y="13" width="7.4" height="3.6" rx="1.3" fill="#fff" fillOpacity="0.85" />
        <line x1="17" y1="10" x2="17" y2="15" stroke="#fff" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.85" />
        <circle cx="17" cy="15.6" r="1.1" fill="#fff" fillOpacity="0.85" />
        <path
          d="M19 1.6 L19.9 3.6 L21.9 4.5 L19.9 5.4 L19 7.4 L18.1 5.4 L16.1 4.5 L18.1 3.6 Z"
          fill="url(#studymate-spark)"
        />
      </svg>
    </span>
  );
}

export function BrandLockup({
  size = 34,
  textSize = 17,
  gap = 9,
}: {
  size?: number;
  textSize?: number;
  gap?: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap, whiteSpace: "nowrap" }}>
      <LogoMark size={size} />
      <span className="brand-text" style={{ fontSize: textSize }}>
        StudyMate
      </span>
    </span>
  );
}
