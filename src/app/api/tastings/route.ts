import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { user_id, bottle_ids, notes, winner_bottle_id } = await request.json()

    if (!user_id || !bottle_ids || !Array.isArray(bottle_ids) || bottle_ids.length === 0 || !winner_bottle_id) {
      return NextResponse.json({ error: 'user_id, bottle_ids (array), and winner_bottle_id are required' }, { status: 400 })
    }

    // Verify that winner_bottle_id is in bottle_ids
    if (!bottle_ids.includes(winner_bottle_id)) {
      return NextResponse.json({ error: 'winner_bottle_id must be one of the bottle_ids' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('tastings')
      .insert([{
        user_id,
        bottle_ids,
        notes: notes || '',
        winner_bottle_id
      }])
      .select()
      .single()

    if (error) {
      console.error('Error inserting tasting:', error)
      return NextResponse.json({ error: 'Failed to create tasting' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in POST /api/tastings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const user_id = searchParams.get('user_id')

    if (!user_id) {
      return NextResponse.json({ error: 'user_id query parameter is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('tastings')
      .select('*')
      .eq('user_id', user_id)

    if (error) {
      console.error('Error fetching tastings:', error)
      return NextResponse.json({ error: 'Failed to fetch tastings' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in GET /api/tastings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
