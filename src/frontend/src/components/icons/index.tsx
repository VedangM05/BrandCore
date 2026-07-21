import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

export const LogoMark: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 32 32" fill="none" {...props}>
    <rect width="32" height="32" rx="8" fill="currentColor" />
    <path d="M9 22V10h5.2c2.8 0 4.6 1.5 4.6 3.8 0 1.6-.9 2.8-2.3 3.4 1.8.5 2.9 1.9 2.9 4 0 2.6-2 4.2-5.2 4.2H9zm3-8.8h2c1.1 0 1.8-.5 1.8-1.4 0-.9-.7-1.4-1.8-1.4h-2v2.8zm0 6.4h2.3c1.2 0 1.9-.6 1.9-1.6 0-1-.7-1.6-1.9-1.6H12v3.2z" fill="white" />
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

export const CopyIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

export const CameraIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <circle cx="12" cy="13" r="3" />
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

export const ChevronLeftIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);

export const PlusIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

export const SearchIcon: React.FC<IconProps> = (props) => (
  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
    <circle cx="11" cy="11" r="8" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
  </svg>
);
