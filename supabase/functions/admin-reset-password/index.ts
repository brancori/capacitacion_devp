import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { userId } = await req.json() // Ya no pedimos newPassword

    if (!userId) throw new Error('userId es requerido')

    // 1. Generar contraseña temporal aleatoria (8 caracteres)
    const tempPassword = Math.random().toString(36).slice(-8);

    // 2. Actualizar Auth con la temporal
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId, 
      { password: tempPassword }
    )
    if (authError) throw authError

    // 3. Activar force_reset en Profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ 
          force_reset: true, // 🛑 ESTO OBLIGA AL CAMBIO
          status: 'active' 
      })
      .eq('id', userId)

    if (profileError) throw profileError

    // 4. Devolver la temporal al Admin
    return new Response(
      JSON.stringify({ success: true, tempPassword: tempPassword }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})