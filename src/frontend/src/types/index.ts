export type TabId = 'campaigns' | 'dna' | 'creator' | 'photoshoot' | 'library' | 'settings';

export interface CampaignCreative {
  id: string;
  type: 'Social Post' | 'Ad Banner' | 'Story' | 'Email Header';
  headline: string;
  aspectRatio: string;
}

export interface Campaign {
  id: string;
  title: string;
  description: string;
  tag: string;
  previewHeadline: string;
  status: string;
  channel: string;
  updatedAt: string;
  creatives: CampaignCreative[];
}

export interface CampaignBrief {
  headline: string;
  body: string;
  social: string;
}

export interface DnaResults {
  brandName: string;
  colors: string[];
  tone: string;
  font: string;
}
