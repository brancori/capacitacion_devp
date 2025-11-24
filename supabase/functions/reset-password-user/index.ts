import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { userId, newPassword } = await req.json()

    // Usamos SERVICE_ROLE porque el usuario NO está logueado (lo bloqueamos antes)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Actualizar contraseña en Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId, 
      { password: newPassword }
    )
    if (updateError) throw updateError

    // 2. Apagar la bandera force_reset en Profiles
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ force_reset: false })
      .eq('id', userId) // O user_id según tu esquema
    
    if (profileError) throw profileError

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})