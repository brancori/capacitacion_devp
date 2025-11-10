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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { userId, newPassword } = await req.json()

    if (!userId || !newPassword) {
      throw new Error('userId y newPassword son requeridos')
    }

    // Verificar force_reset
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('force_reset')
      .eq('user_id', userId)
      .single()

    if (!profile?.force_reset) {
      throw new Error('Este usuario no requiere cambio de contraseña')
    }

    // Actualizar contraseña
    await supabaseAdmin.auth.admin.updateUserById(userId, { 
      password: newPassword 
    })

    // Limpiar bandera
    await supabaseAdmin
      .from('profiles')
      .update({ force_reset: false, autorizado: true })
      .eq('user_id', userId)

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