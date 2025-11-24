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

    // Actualizar contraseña directamente
    const { data: user, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId, 
      { password: newPassword }
    )

    if (error) throw error

    // Reactivar usuario y limpiar bandera de reset
    await supabaseAdmin
      .from('profiles')
      .update({ 
          force_reset: false,
          status: 'active'
      })
      .eq('id', userId) 

    return new Response(
      JSON.stringify({ success: true, message: 'Contraseña actualizada' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})