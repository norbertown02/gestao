import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  'https://kruldbtjyhfiswmwmoyz.supabase.co',
  'sb_publishable_VcS5TqxQ6FFXN9kwkdnuoA_wSHQ5j2d'
)

export const supabaseAdmin = createClient(
  'https://kruldbtjyhfiswmwmoyz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtydWxkYnRqeWhmaXN3bXdtb3l6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTY4MzYwNCwiZXhwIjoyMDk1MjU5NjA0fQ.HqA_RMrlnfzm4XewYt9ZC_HJZR4dkQfBdac5Jsqpfcw',
  { auth: { autoRefreshToken: false, persistSession: false } }
)
