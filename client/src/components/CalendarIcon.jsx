export default function CalendarIcon({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="brand-icon"
    >
      <rect x="3" y="4.5" width="18" height="16" rx="4" fill="var(--brand-600)" />
      <rect x="3" y="4.5" width="18" height="5" rx="4" fill="var(--brand-700)" opacity="0.35" />
      <rect x="7" y="2" width="2" height="4" rx="1" fill="var(--brand-700)" />
      <rect x="15" y="2" width="2" height="4" rx="1" fill="var(--brand-700)" />
      <rect x="6.5" y="12" width="3" height="3" rx="1" fill="white" opacity="0.9" />
      <rect x="10.5" y="12" width="3" height="3" rx="1" fill="white" opacity="0.55" />
      <rect x="14.5" y="12" width="3" height="3" rx="1" fill="white" opacity="0.55" />
    </svg>
  );
}
