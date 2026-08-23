export default function BrandIcon({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="brand-icon"
    >
      <rect x="2" y="3" width="20" height="18" rx="5" fill="var(--brand-600)" />
      <polygon points="12,7.5 18.5,10.5 12,13.5 5.5,10.5" fill="white" />
      <rect x="8.7" y="11.5" width="1.3" height="4.2" rx="0.65" fill="white" opacity="0.85" />
      <circle cx="16.5" cy="16.3" r="3.1" fill="var(--brand-700)" />
      <path
        d="M15.1 16.3 L16.1 17.3 L18 15.3"
        stroke="white"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
