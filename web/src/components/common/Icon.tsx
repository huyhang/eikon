import type { SVGProps } from 'react';

/** SF Symbols–inspired line icons, drawn on a 24×24 grid. */
const PATHS = {
  library:
    'M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Zm0 7 4.2-3.8a1.5 1.5 0 0 1 2 0L16 16m-2-2 1.6-1.4a1.5 1.5 0 0 1 2 0L20 14.7M15.5 9.25a1.25 1.25 0 1 0 0-.01',
  illustrators: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.8-3.4 3.6-5.5 7-5.5s6.2 2.1 7 5.5',
  collections:
    'M7 3.75h10M5.5 6.75h13M5 9.75h14a1.25 1.25 0 0 1 1.25 1.25v7.75A1.25 1.25 0 0 1 19 20H5a1.25 1.25 0 0 1-1.25-1.25V11A1.25 1.25 0 0 1 5 9.75Z',
  search: 'M10.75 17.5a6.75 6.75 0 1 0 0-13.5 6.75 6.75 0 0 0 0 13.5ZM15.6 15.6 20 20',
  heart:
    'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 8.8 5.5c1.4 0 2.5.7 3.2 1.8.7-1.1 1.8-1.8 3.2-1.8a4.3 4.3 0 0 1 4.3 4.3C19.5 15.4 12 20 12 20Z',
  gear: 'M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Zm7.4-3.25c0-.5 0-1-.1-1.4l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2.4-1.4L14 2.6h-4l-.5 2.5a7.5 7.5 0 0 0-2.4 1.4l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2.8l-2 1.6 2 3.4 2.4-.9c.7.6 1.5 1.1 2.4 1.4l.5 2.5h4l.5-2.5c.9-.3 1.7-.8 2.4-1.4l2.4.9 2-3.4-2-1.6c.1-.4.1-.9.1-1.4Z',
  close: 'M6 6l12 12M18 6 6 18',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v5.5M12 7.6v.1',
  share:
    'M12 3.5v11M8 7.5l4-4 4 4M7 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1',
  pencil: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Zm9.5-13.5 4 4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  star: 'm12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6Z',
  safe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18v18',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15',
  sparkles:
    'M10 3.5 11.6 8 16 9.5l-4.4 1.6L10 15.5 8.4 11 4 9.5 8.4 8 10 3.5Zm7.5 9 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z',
  eyeSlash:
    'M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.6 3.8M6.6 6.6A13 13 0 0 0 2.5 12c1 2.5 4.5 7 9.5 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  trash:
    'M4.5 6.5h15M9.5 6.5V4.75A1.25 1.25 0 0 1 10.75 3.5h2.5a1.25 1.25 0 0 1 1.25 1.25V6.5m-8 0 .9 12.1A2 2 0 0 0 9.4 20.5h5.2a2 2 0 0 0 2-1.9l.9-12.1',
  lock: 'M7 10.5V8a5 5 0 0 1 10 0v2.5M6 10.5h12A1.5 1.5 0 0 1 19.5 12v7A1.5 1.5 0 0 1 18 20.5H6A1.5 1.5 0 0 1 4.5 19v-7A1.5 1.5 0 0 1 6 10.5Z',
  download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
  folder:
    'M3.5 7A1.5 1.5 0 0 1 5 5.5h4.4l2 2H19A1.5 1.5 0 0 1 20.5 9v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V7Z',
  delete: 'M9 6.5h10.5A1.5 1.5 0 0 1 21 8v8a1.5 1.5 0 0 1-1.5 1.5H9L3 12l6-5.5ZM12 9.5l5 5m0-5-5 5',
  shuffle:
    'M3.5 7h3.3c1.6 0 3 .8 3.9 2.1l2.6 3.8c.9 1.3 2.3 2.1 3.9 2.1h3.3M3.5 17h3.3c1.6 0 3-.8 3.9-2.1M13.3 9.1c.9-1.3 2.3-2.1 3.9-2.1h3.3M18 4.5 20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5',
  wifiOff:
    'M3 3l18 18M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.3M14.6 10.1A10 10 0 0 1 19 12.5M2 9a14.5 14.5 0 0 1 4.3-2.7M10.7 5.1A14.5 14.5 0 0 1 22 9M12 19.5v.1',
} as const;

export type IconName = keyof typeof PATHS;

const FILLED: Partial<Record<IconName, true>> = {};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  filled?: boolean;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, filled = false, strokeWidth = 1.8, ...rest }: IconProps) {
  const fill = filled || FILLED[name] ? 'currentColor' : 'none';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
      {name === 'safe' && <path d="M12 3a9 9 0 0 1 0 18V3Z" fill="currentColor" stroke="none" />}
    </svg>
  );
}
