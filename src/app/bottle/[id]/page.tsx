import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import BottleDetailView from '@/components/BottleDetailView';

// Define the bottle details interface
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

// Generate metadata
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bottle = await fetchBottleDetails(id);
  if (!bottle) return { title: 'Bottle Not Found' };
  return { title: `${bottle.name} - Pour Choices` };
}

// Server component to fetch data
export default async function BottlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bottle = await fetchBottleDetails(id);

  if (!bottle) {
    notFound();
  }

  return <BottleDetailView bottle={bottle} />;
}

// Fetch bottle details from Supabase
async function fetchBottleDetails(bottleId: string): Promise<BottleDetails | null> {
  try {
    const supabase = await createSupabaseServerClient();

    // Fetch from the view used in search
    const { data: bottles, error } = await supabase
      .from('all_bottle_details')
      .select('*')
      .eq('bottle_id', bottleId);

    if (error || !bottles || bottles.length === 0) {
      // Return stub data for testing when no bottle is found
      return {
        id: bottleId,
        name: 'Macallan 12 Year Single Malt Scotch Whisky',
        distillery: 'The Macallan',
        category: 'Whisky',
        style: 'Single Malt',
        age: '12',
        proof: 40,
        volume: '750ml',
        elo_global: 1650,
        verified: true,
        barcode: '5010314304109',
        lastActivity: 'Never',
        frontImageUrl: '', // No image for now
        backImageUrl: '',
        variants: [
          { releaseYear: '2023', batch: 'Lot 001', storePickName: 'Shop A' },
          { releaseYear: '2023', batch: 'Lot 002', storePickName: 'Shop B' },
        ],
        nose: 'Sweet notes of vanilla, pear and honey, with hints of oak and spice.',
        palate: 'Smooth and rich, with flavors of warming cinnamon, dried fruits and a subtle smokiness.',
        finish: 'Long and elegant, with lingering notes of oak and spice.',
      };
    }

    // Group by bottle_id, but since fetched one, process as array
    const bottle = bottles[0];

    // Parse notes
    const notes = bottle.attr_notes || '';
    const noseMatch = notes.match(/Nose:\s*(.*?)(?=(Palate:|Finish:|$))/is);
    const palateMatch = notes.match(/Palate:\s*(.*?)(?=(Finish:|$))/is);
    const finishMatch = notes.match(/Finish:\s*(.*?)$/is);

    const lastActivity = "Never"; // Stub

    return {
      id: bottle.bottle_id,
      name: bottle.bottle_name,
      distillery: bottle.bottle_distillery,
      category: bottle.bottle_category,
      style: bottle.bottle_style,
      age: bottle.attr_age,
      proof: bottle.attr_proof,
      volume: bottle.attr_volume,
      elo_global: bottle.bottle_elo_global,
      verified: bottle.bottle_verified,
      barcode: bottle.bottle_barcode,
      lastActivity,
      frontImageUrl: bottle.attr_frontimage_url,
      backImageUrl: bottle.attr_backimage_url,
      variants: bottles.map(b => ({
        releaseYear: b.attr_year_released,
        batch: b.attr_batch,
        storePickName: b.attr_store_pick_name,
      })).filter(v => v.releaseYear || v.batch || v.storePickName), // Only if some data
      nose: noseMatch?.[1]?.trim() || undefined,
      palate: palateMatch?.[1]?.trim() || undefined,
      finish: finishMatch?.[1]?.trim() || undefined,
    };
  } catch (error) {
    console.error('Error fetching bottle details:', error);
    // Return stub for testing
    return {
      id: bottleId,
      name: 'Stub Bottle',
      distillery: 'Stub Distillery',
      category: 'Stub Category',
      style: 'Stub Style',
      age: '12',
      proof: 40,
      volume: '750ml',
      elo_global: 1500,
      verified: true,
      barcode: '123456789',
      lastActivity: 'Never',
      frontImageUrl: '',
      backImageUrl: '',
      variants: [],
      nose: undefined,
      palate: undefined,
      finish: undefined,
    };
  }
}
