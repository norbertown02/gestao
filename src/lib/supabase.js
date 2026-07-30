import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kruldbtjyhfiswmwmoyz.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_VcS5TqxQ6FFXN9kwkdnuoA_wSHQ5j2d'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

// Compatibilidade com as telas existentes. Este cliente usa a sessão do
// usuário e respeita RLS; chaves administrativas nunca devem ir ao navegador.
export const supabaseAdmin = supabase
