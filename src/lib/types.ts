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
  variants: Array<{
    releaseYear?: string;
    batch?: string;
    storePickName?: string;
  }>;
  nose?: string;
  palate?: string;
  finish?: string;
}
