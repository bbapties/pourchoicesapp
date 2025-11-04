import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

    // Get the current user session
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      console.error('Auth getUser error:', error)
      return NextResponse.json(null)
    }

    if (!user) {
      return NextResponse.json(null)
    }

    // Get user profile data
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, username, email')
      .eq('auth_id', user.id)
      .single()

    if (userError) {
      console.error('User fetch error:', userError)
      return NextResponse.json(null)
    }

    return NextResponse.json({
      user: {
        id: userData.id,
        username: userData.username,
        email: userData.email,
      }
    })
  } catch (error) {
    console.error('Me route error:', error)
    return NextResponse.json(null)
  }
}
