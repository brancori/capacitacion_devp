import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, password, tenant_slug } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Verificar tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenant_slug)
      .single()

    if (!tenant) {
      return new Response(
        JSON.stringify({ error: 'Tenant inválido', error_code: 'INVALID_TENANT' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 2. Login
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message, error_code: 'AUTH_ERROR' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // 3. Verificar profile
      const { data: profile } = await supabase
      .from('profiles')
      .select('role, tenant_id, force_reset') 
      .eq('id', authData.user.id)
      .single();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: 'Perfil no encontrado', error_code: 'NO_PROFILE' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    if (profile.role !== 'master' && profile.tenant_id !== tenant.id) {
      return new Response(JSON.stringify({
        error: 'Acceso denegado: No perteneces a este tenant',
        error_code: 'WRONG_TENANT'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403
      });
    }

    if (profile.force_reset) {
      return new Response(
        JSON.stringify({ 
          error: 'Cambio de contraseña requerido', 
          error_code: 'FORCE_RESET',
          user_id: authData.user.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // 4. 🔥 DEVOLVER JWT
    return new Response(
      JSON.stringify({ 
        jwt: authData.session.access_token,  // ← CRÍTICO
        user: authData.user,
        role: profile.role
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message, error_code: 'SERVER_ERROR' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})