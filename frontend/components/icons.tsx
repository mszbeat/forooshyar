import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function make(name: string, children: React.ReactNode) {
  const C = ({ size = 18, ...props }: P) => (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
      className={`ico ${props.className ?? ''}`} aria-hidden="true" {...props}
    >
      {children}
    </svg>
  );
  C.displayName = name;
  return C;
}

export const IconDashboard = make('IconDashboard', <><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>);
export const IconBox = make('IconBox', <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></>);
export const IconTag = make('IconTag', <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z" /><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" /></>);
export const IconUpload = make('IconUpload', <><path d="M21 15v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3" /><path d="m7 9 5-5 5 5" /><path d="M12 4v12" /></>);
export const IconSparkles = make('IconSparkles', <><path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" /><path d="M18.5 15.5 19.6 18l2.4 1-2.4 1-1.1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" /></>);
export const IconSettings = make('IconSettings', <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>);
export const IconChat = make('IconChat', <><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5Z" /><path d="M8.5 10.5h7M8.5 14h4" /></>);
export const IconUsers = make('IconUsers', <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>);
export const IconLogout = make('IconLogout', <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>);
export const IconSearch = make('IconSearch', <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconPlus = make('IconPlus', <><path d="M12 5v14M5 12h14" /></>);
export const IconMinus = make('IconMinus', <><path d="M5 12h14" /></>);
export const IconCheck = make('IconCheck', <><path d="m20 6-11 11-5-5" /></>);
export const IconCheckCircle = make('IconCheckCircle', <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>);
export const IconX = make('IconX', <><path d="M18 6 6 18M6 6l12 12" /></>);
export const IconChevronDown = make('IconChevronDown', <><path d="m6 9 6 6 6-6" /></>);
export const IconChevronLeft = make('IconChevronLeft', <><path d="m15 18-6-6 6-6" /></>);
export const IconArrowLeft = make('IconArrowLeft', <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>);
export const IconArrowRight = make('IconArrowRight', <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>);
export const IconAlert = make('IconAlert', <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>);
export const IconAlertCircle = make('IconAlertCircle', <><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></>);
export const IconTrendUp = make('IconTrendUp', <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>);
export const IconTrendDown = make('IconTrendDown', <><path d="m3 7 6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>);
export const IconMoney = make('IconMoney', <><rect x="2" y="6" width="20" height="12" rx="3" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>);
export const IconWallet = make('IconWallet', <><path d="M20 7H5a2 2 0 0 1 0-4h13v4" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1" /><path d="M17.5 13.5h.01" /></>);
export const IconPackage = make('IconPackage', <><path d="M16.5 9.4 7.5 4.2" /><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="M3.3 7 12 12l8.7-5" /><path d="M12 22V12" /></>);
export const IconBell = make('IconBell', <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>);
export const IconMenu = make('IconMenu', <><path d="M4 6h16M4 12h16M4 18h16" /></>);
export const IconEdit = make('IconEdit', <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></>);
export const IconTrash = make('IconTrash', <><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>);
export const IconCopy = make('IconCopy', <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>);
export const IconExternal = make('IconExternal', <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6" /><path d="M10 14 21 3" /></>);
export const IconClock = make('IconClock', <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconReply = make('IconReply', <><path d="m9 14-5-5 5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-4" /></>);
export const IconSend = make('IconSend', <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>);
export const IconRefresh = make('IconRefresh', <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></>);
export const IconShield = make('IconShield', <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>);
export const IconBolt = make('IconBolt', <><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" /></>);
export const IconFile = make('IconFile', <><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7l-5-5Z" /><path d="M14 2v5h5" /></>);
export const IconDownload = make('IconDownload', <><path d="M21 15v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>);
export const IconStore = make('IconStore', <><path d="M3 9.5 4.5 4h15L21 9.5" /><path d="M3 9.5A2.5 2.5 0 0 0 5.5 12 2.5 2.5 0 0 0 8 9.5 2.5 2.5 0 0 0 10.5 12 2.5 2.5 0 0 0 13 9.5 2.5 2.5 0 0 0 15.5 12 2.5 2.5 0 0 0 18 9.5 2.5 2.5 0 0 0 20.5 12" /><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" /></>);
export const IconGrid = make('IconGrid', <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);
export const IconList = make('IconList', <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>);
export const IconEye = make('IconEye', <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>);
export const IconInfo = make('IconInfo', <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>);
export const IconLogo = make('IconLogo', <><path d="M4 18V9.5C4 6.5 6.2 4 9 4c1.7 0 3 .8 3.8 2 .8-1.2 2.1-2 3.8-2 2.8 0 5 2.5 5 5.5V18" /><path d="M8 21h8" /><path d="M12 12v6" /></>);
