export type TabId = 'coordinator' | 'campaigns' | 'dna' | 'photoshoot' | 'library' | 'settings';

export interface SiteImage {
  url: string;
  alt: string;
}

export interface DnaResults {
  id?: string;
  brandName: string;
  colors: string[];
  tone: string;
  font: string;
  tagline?: string;
  // Already extracted/synthesized by the backend (dna.service.ts /
  // intelligence.service.ts) but previously discarded at the fetch site -
  // the Business DNA display only ever showed colors/font/tone/tagline.
  mission?: string;
  audience?: string;
  valueProposition?: string;
  logoUrl?: string;
  siteImages?: SiteImage[];
}
