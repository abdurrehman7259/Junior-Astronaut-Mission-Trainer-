/**
 * Shared inline SVG icons. Simple, original shapes. Decorative: always aria-hidden,
 * the meaning is carried by the text next to each icon.
 */

function Svg({ className, size = 24, children }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const BatteryIcon = (p) => (
  <Svg {...p}>
    <rect x="2" y="7" width="17" height="10" rx="2" />
    <path d="M22 10.5v3" />
    <path d="M6 10.5v3M10 10.5v3M14 10.5v3" />
  </Svg>
);

export const LeafIcon = (p) => (
  <Svg {...p}>
    <path d="M5 19C4 11 9 5 20 4c0 11-5 16-13 16" />
    <path d="M5 19c3-5 6-8 10-10" />
  </Svg>
);

export const HeartIcon = (p) => (
  <Svg {...p}>
    <path d="M12 20s-8-4.8-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.2 12 20 12 20z" />
  </Svg>
);

export const FlaskIcon = (p) => (
  <Svg {...p}>
    <path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3" />
    <path d="M7.5 15h9" />
  </Svg>
);

export const ShieldIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3l8 3v5.5c0 4.5-3.2 8-8 9.5-4.8-1.5-8-5-8-9.5V6z" />
  </Svg>
);

export const WarningIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3.5L2.5 20h19z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </Svg>
);

export const CheckIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M7.5 12.5l3 3 6-6.5" />
  </Svg>
);

export const InfoIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.5v.01" />
  </Svg>
);

export const SunIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
  </Svg>
);

/** A lightning bolt: one severity pip. Solid when `filled`, outline otherwise. */
export const BoltIcon = ({ filled, ...p }) => (
  <Svg {...p}>
    <path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" fill={filled ? 'currentColor' : 'none'} />
  </Svg>
);

export const RadiationIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="1.8" />
    <path d="M12 10.2L8.2 3.6a9 9 0 0 1 7.6 0z" />
    <path d="M10.4 13l-7.6.2a9 9 0 0 1 3.8-6.6z" />
    <path d="M13.6 13l3.8 6.6a9 9 0 0 1-3.8 1.3z" />
  </Svg>
);
