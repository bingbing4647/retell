// 线性图标（stroke 风格），统一 1.7 描边
const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconGrid(p) {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
    </svg>
  );
}

export function IconSearch(p) {
  return (
    <svg {...base} width={16} height={16} {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

export function IconSpeak(p) {
  return (
    <svg {...base} {...p}>
      <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.8a9 9 0 0 1 0 12.4" />
    </svg>
  );
}

export function IconStop(p) {
  return (
    <svg {...base} {...p}>
      <rect x="6" y="6" width="12" height="12" rx="2.2" />
    </svg>
  );
}

export function IconPrint(p) {
  return (
    <svg {...base} {...p}>
      <path d="M6 9V3.5h12V9" />
      <rect x="3" y="9" width="18" height="7.5" rx="2" />
      <path d="M6 16.5V20.5h12v-4" />
    </svg>
  );
}

export function IconDownload(p) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3.5v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 19.5h16" />
    </svg>
  );
}

export function IconBack(p) {
  return (
    <svg {...base} width={16} height={16} {...p}>
      <path d="M14.5 5 8 12l6.5 7" />
    </svg>
  );
}

export function IconArrowL(p) {
  return (
    <svg {...base} width={15} height={15} {...p}>
      <path d="M15 12H4" />
      <path d="m9 7-5 5 5 5" />
    </svg>
  );
}

export function IconArrowR(p) {
  return (
    <svg {...base} width={15} height={15} {...p}>
      <path d="M9 12h11" />
      <path d="m15 7 5 5-5 5" />
    </svg>
  );
}

export function IconCheck(p) {
  return (
    <svg {...base} width={12} height={12} strokeWidth={2.6} {...p}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

export function IconClock(p) {
  return (
    <svg {...base} width={12} height={12} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconPlay(p) {
  return (
    <svg {...base} {...p}>
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

export function IconClose(p) {
  return (
    <svg {...base} {...p}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function IconEye(p) {
  return (
    <svg {...base} {...p}>
      <path d="M2.6 12S6 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12Z" />
      <circle cx="12" cy="12" r="3.1" />
    </svg>
  );
}

export function IconEyeOff(p) {
  return (
    <svg {...base} {...p}>
      <path d="M4.2 8.7C3.1 10 2.6 12 2.6 12s3.4 6.2 9.4 6.2c1.6 0 3-.4 4.2-1.1" />
      <path d="M9.6 6.2c.8-.3 1.6-.4 2.4-.4 6 0 9.4 6.2 9.4 6.2s-1 1.9-2.8 3.4" />
      <path d="M10 10a3 3 0 0 0 4 4" />
      <path d="m4 4 16 16" />
    </svg>
  );
}

export function IconStar(p) {
  return (
    <svg {...base} width={13} height={13} {...p}>
      <path d="m12 3.7 2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.75-5.2 2.75 1-5.8-4.2-4.1 5.8-.85z" />
    </svg>
  );
}

export function IconExpand(p) {
  return (
    <svg {...base} {...p}>
      <path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5" />
    </svg>
  );
}
