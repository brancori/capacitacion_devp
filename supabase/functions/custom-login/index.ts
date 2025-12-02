// supabase/functions/custom-login/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email, password, tenant_slug } = await req.json()
    
    // 1. Cliente Admin (Service Role)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Obtener el Tenant al que se intenta acceder
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('slug', tenant_slug)
      .single()

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: 'Tenant no válido', error_code: 'INVALID_TENANT' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. BUSCAR PERFIL [CRÍTICO: LÓGICA MASTER IMPLEMENTADA]
    // Buscamos un perfil que coincida con el email Y ADEMÁS:
    // Opción A: Pertenezca al tenant actual.
    // Opción B: Tenga tenant_id NULO (Usuario Global/Master).
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, status, force_reset, role, tenant_id')
      .eq('email', email)
      .or(`tenant_id.eq.${tenant.id},tenant_id.is.null`) // <--- AQUÍ ESTÁ EL CAMBIO
      .single()

    // 4. LÓGICA DE USUARIO PENDING (Bypass de contraseña para configuración inicial)
    if (profile && profile.status === 'pending' && profile.force_reset) {
        return new Response(
            JSON.stringify({ 
                action: 'FORCE_RESET', 
                user_id: profile.id,
                message: 'Usuario requiere configuración inicial' 
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    // 5. Login Normal (Requiere password)
    if (!password) {
        return new Response(
            JSON.stringify({ error: 'Contraseña requerida', error_code: 'PASSWORD_MISSING' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    // Autenticación estándar con Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    })

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message, error_code: 'AUTH_ERROR' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. VERIFICACIÓN FINAL DE SEGURIDAD
    // Ya encontramos el perfil, pero validamos una última vez:
    // Si NO es Master, es OBLIGATORIO que su tenant_id coincida con el tenant actual.
    // Esto previene que un usuario de "Siresi" entre a "JNJ" aunque hayamos encontrado su perfil por error.
    if (profile && profile.role !== 'master' && profile.tenant_id !== tenant.id) {
       return new Response(JSON.stringify({ error: 'Acceso denegado', error_code: 'WRONG_TENANT' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(
      JSON.stringify({
        jwt: authData.session.access_token,
        user: authData.user,
        role: profile?.role // Ahora sí devolverá 'master'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})