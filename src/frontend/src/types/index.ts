export type TabId = 'coordinator' | 'campaigns' | 'dna' | 'photoshoot' | 'library' | 'settings';

export interface DnaResults {
  id?: string;
  brandName: string;
  colors: string[];
  tone: string;
  font: string;
  tagline?: string;
}
