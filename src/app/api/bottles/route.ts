import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { name, type } = await request.json()

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and type are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('bottles')
      .insert([{ name, type, provisional: true }])
      .select()
      .single()

    if (error) {
      console.error('Error inserting bottle:', error)
      return NextResponse.json({ error: 'Failed to create bottle' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in POST /api/bottles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')

    let query = supabase.from('bottles').select('*')

    if (q) {
      query = query.ilike('name', `%${q}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching bottles:', error)
      return NextResponse.json({ error: 'Failed to fetch bottles' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in GET /api/bottles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
