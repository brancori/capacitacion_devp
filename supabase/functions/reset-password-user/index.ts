// supabase/functions/reset-password-user/index.ts
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
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Doble verificación de seguridad: Solo permitir si sigue en pending/force_reset
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('status, force_reset')
        .eq('id', userId)
        .single()

    const isValidStatus = profile?.status === 'pending' || profile?.status === 'active';

    if (!profile || !isValidStatus || !profile.force_reset) {
        throw new Error("Operación no permitida: El usuario no requiere restablecimiento.")
    }

    // 1. Actualizar contraseña en Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword, email_confirm: true }
    )
    if (updateError) throw updateError

    // 2. Actualizar perfil a Active
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ status: 'active', force_reset: false })
      .eq('id', userId)

    if (profileError) throw profileError

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})