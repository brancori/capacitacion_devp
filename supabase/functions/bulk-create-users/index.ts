import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { users, tenant_id } = await req.json()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const results = []
    const errors = []

    for (const user of users) {
      const email = user.email.toLowerCase()
      try {
        // 1. Crear en Auth
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true
        })

        if (authError) throw authError

        // 2. Crear en Profiles con force_reset=true
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: authData.user.id,
            email: user.email,
            full_name: user.full_name,
            role: 'user',
            user_type: 'employee',
            status: 'pending',
            tenant_id: tenant_id,
            force_reset: true
          })

        if (profileError) throw profileError

        results.push({ email: user.email, success: true })
      } catch (err) {
        errors.push({ email: user.email, error: err.message })
      }
    }

    return new Response(
      JSON.stringify({ results, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})