import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { username, email, password } = await request.json()

    if (!username || !email || !password) {
      return NextResponse.json(
        { error: 'Username, email, and password are required' },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

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

    // Sign up the user with Supabase Auth
    let authData, authError
    try {
      const result = await supabase.auth.signUp({
        email,
        password,
      })
      authData = result.data
      authError = result.error
    } catch (error) {
      console.error('Auth signup error:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json(
        { error: message },
        { status: 400 }
      )
    }

    if (authError) {
      console.error('Auth signup error:', authError)
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      )
    }

    // Set cookie after successful signup
    if (authData.session) {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        console.error('Session error:', sessionError)
      }
    }

    // Insert user data into users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([
        {
          auth_id: authData.user.id,
          username,
          email,
        }
      ])
      .select()
      .single()

    if (userError) {
      console.error('User insert error:', userError)
      // If user creation fails, we should clean up the auth user
      // But for now, we'll just return the error
      return NextResponse.json(
        { error: 'Failed to create user profile' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      user_id: userData.id,
      username: userData.username,
      email: userData.email,
    })
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
