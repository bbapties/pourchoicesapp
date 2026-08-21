export interface BottleVariant {
  variantId?: string;
  isDefault?: boolean;
  elo_global?: number;
  verified?: boolean;
  frontImageUrl?: string;
  backImageUrl?: string;
  age?: string;
  proof?: number;
  releaseYear?: string;
  batch?: string;
  storePickName?: string;
  notes?: string;
  nose?: string;
  palate?: string;
  finish?: string;
}

export interface BottleDetails {
  id: string;
  name: string;
  distillery?: string;
  category?: string;
  style?: string;
  age?: string;
  proof?: number;
  volume?: string;
  elo_global?: number;
  verified: boolean;
  barcode?: string;
  lastActivity?: string; // Calculated field
  frontImageUrl?: string;
  backImageUrl?: string;
  variants: BottleVariant[];
  nose?: string;
  palate?: string;
  finish?: string;
  extras?: string;
}
