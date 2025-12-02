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
    
    console.log(`🔐 [custom-login] Intento de login: ${email} → tenant: ${tenant_slug}`)
    
    // 1. Cliente Admin (Service Role)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Obtener el Tenant al que se intenta acceder
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, slug')
      .eq('slug', tenant_slug)
      .single()

    if (tenantError || !tenant) {
      console.log(`❌ Tenant no encontrado: ${tenant_slug}`)
      return new Response(
        JSON.stringify({ error: 'Tenant no válido', error_code: 'INVALID_TENANT' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✓ Tenant encontrado: ${tenant.slug} (${tenant.id})`)

    // 3. BUSCAR PERFIL
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, status, force_reset, role, tenant_id, email')
      .eq('email', email)
      .or(`tenant_id.eq.${tenant.id},tenant_id.is.null`)
      .single()

    if (profileError) {
      console.log(`❌ Error buscando perfil: ${profileError.message}`)
      return new Response(
        JSON.stringify({ error: 'Usuario no encontrado', error_code: 'USER_NOT_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!profile) {
      console.log(`❌ Perfil no encontrado para: ${email}`)
      return new Response(
        JSON.stringify({ error: 'Usuario no encontrado', error_code: 'USER_NOT_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✓ Perfil encontrado: role=${profile.role}, status=${profile.status}, force_reset=${profile.force_reset}`)

    // 4. LÓGICA DE USUARIO PENDING CON FORCE_RESET
    if (profile.status === 'pending' && profile.force_reset) {
        console.log(`⚠️ Usuario requiere configuración inicial (FORCE_RESET)`)
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
        console.log(`❌ Password faltante`)
        return new Response(
            JSON.stringify({ error: 'Contraseña requerida', error_code: 'PASSWORD_MISSING' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    // 6. Autenticación con Supabase Auth
    console.log(`🔑 Intentando autenticación con Supabase Auth...`)
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    })

    if (authError) {
      console.log(`❌ Error de autenticación: ${authError.message}`)
      console.log(`   Código: ${authError.status}`)
      return new Response(
        JSON.stringify({ 
          error: authError.message, 
          error_code: 'AUTH_ERROR',
          details: `Verificar contraseña para ${email}` 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ Autenticación exitosa`)

    // 7. VERIFICACIÓN FINAL DE SEGURIDAD MULTI-TENANT
    if (profile.role !== 'master' && profile.tenant_id !== tenant.id) {
       console.log(`❌ Usuario de otro tenant intentando acceder`)
       return new Response(
         JSON.stringify({ error: 'Acceso denegado', error_code: 'WRONG_TENANT' }), 
         { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       )
    }

    // 8. Verificar que el usuario esté activo
    if (profile.status !== 'active') {
      console.log(`❌ Usuario no activo: status=${profile.status}`)
      return new Response(
        JSON.stringify({ 
          error: 'Usuario inactivo o pendiente de aprobación', 
          error_code: 'USER_INACTIVE',
          status: profile.status
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ Login exitoso: ${email} como ${profile.role}`)

    return new Response(
      JSON.stringify({
        jwt: authData.session.access_token,
        user: authData.user,
        role: profile.role
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error inesperado:', error.message)
    console.error('   Stack:', error.stack)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        error_code: 'INTERNAL_ERROR'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})