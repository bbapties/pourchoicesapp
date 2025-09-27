import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lrvraigdihzkgphjdezk.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxydnJhaWdkaWh6a2dwaGpkZXprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1ODg3MTcsImV4cCI6MjA3MjE2NDcxN30.C7f1DJh-BDkkwIKmV-RaZ-NJA7LHEacSoNtoY_sgSDE'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})
