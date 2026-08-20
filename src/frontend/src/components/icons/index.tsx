import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

export const LogoMark: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 32 32" fill="none" {...props}>
    <rect width="32" height="32" rx="8" fill="currentColor" />
    <path d="M9 22V10h5.2c2.8 0 4.6 1.5 4.6 3.8 0 1.6-.9 2.8-2.3 3.4 1.8.5 2.9 1.9 2.9 4 0 2.6-2 4.2-5.2 4.2H9zm3-8.8h2c1.1 0 1.8-.5 1.8-1.4 0-.9-.7-1.4-1.8-1.4h-2v2.8zm0 6.4h2.3c1.2 0 1.9-.6 1.9-1.6 0-1-.7-1.6-1.9-1.6H12v3.2z" fill="white" />
  </svg>
);

// Google's official four-color "G" mark, used only inside GoogleAuthButton.tsx
// to identify the "Continue with Google" option - not tintable via
// currentColor like the rest of these icons, since the brand's own colors
// are the point.
export const GoogleGlyph: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path
      d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81z"
      fill="#4285F4"
    />
    <path
      d="M12 24c3.24 0 5.95-1.08 7.94-2.92l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0 0 12 24z"
      fill="#34A853"
    />
    <path d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.27a12 12 0 0 0 0 10.74l4-3.1z" fill="#FBBC05" />
    <path
      d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.63l4 3.1C6.22 6.87 8.87 4.75 12 4.75z"
      fill="#EA4335"
    />
  </svg>
);

export const CampaignsIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
  </svg>
);

export const DnaIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M7 7c2 2 4 2 5 0s3-2 5 0M7 17c2-2 4-2 5 0s3 2 5 0" />
  </svg>
);

export const CameraIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

// Bolt/lightning - used for the Quick Generate (Coordinator Agent) nav item.
export const BoltIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
  </svg>
);

export const FolderIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

export const SettingsIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const SearchIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
    <circle cx="11" cy="11" r="8" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
  </svg>
);

export const GlobeIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" {...props}>
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
  </svg>
);

export const AlertIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.2A1.5 1.5 0 003.4 20.5h17.2a1.5 1.5 0 001.29-2.44l-8.18-14.2a1.5 1.5 0 00-2.42 0z" />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
  </svg>
);

export const ArrowLeftIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0l6 6m-6-6l6-6" />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const ImageIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" {...props}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
  </svg>
);

export const MenuIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const SunIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" {...props}>
    <circle cx="12" cy="12" r="4" />
    <path strokeLinecap="round" d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

export const MoonIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);
