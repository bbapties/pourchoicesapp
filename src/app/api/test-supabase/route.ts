import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { data: bottles, error } = await supabase
      .from('bottles')
      .select('name, type')
      .limit(5);

    return NextResponse.json({
      success: true,
      message: 'Supabase connected!',
      bottles: bottles || [],
      error: error ? error.message : null
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMessage });
  }
}
