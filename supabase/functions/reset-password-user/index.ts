// supabase/functions/seed-users/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { 
      cleanup = false,           // Nuevo: limpiar antes de crear
      tenant_slug = 'test-suite',
      custom_users = null        // Nuevo: usuarios personalizados con estados
    } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // PASO 0: LIMPIEZA (si se solicita)
    if (cleanup) {
      console.log('🧹 Limpiando usuarios de prueba...')
      
      // Eliminar perfiles de prueba
      const { data: testProfiles } = await supabase
        .from('profiles')
        .select('id')
        .or('email.like.test.%@test.com,email.like.pending.%@test.com,email.like.forcereset.%@test.com,email.like.othertenant.%@test.com')

      if (testProfiles?.length) {
        for (const profile of testProfiles) {
          await supabase.auth.admin.deleteUser(profile.id)
        }
      }
    }

    // PASO 1: Asegurar Tenant
    let { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenant_slug)
      .single()
    
    if (!tenant) {
      const { data: newTenant } = await supabase
        .from('tenants')
        .insert({ name: 'Test Suite Tenant', slug: tenant_slug })
        .select('id')
        .single()
      tenant = newTenant
    }

    // PASO 2: Definir usuarios a crear
    const defaultUsers = [
      { email: 'test.master@test.com', role: 'master', status: 'active', force_reset: false },
      { email: 'test.admin@test.com', role: 'admin', status: 'active', force_reset: false },
      { email: 'test.supervisor@test.com', role: 'supervisor', status: 'active', force_reset: false },
      { email: 'test.auditor@test.com', role: 'auditor', status: 'active', force_reset: false },
      { email: 'test.user@test.com', role: 'user', status: 'active', force_reset: false },
    ]

    const usersToCreate = custom_users || defaultUsers
    const results = []

    // PASO 3: Crear usuarios
    for (const u of usersToCreate) {
      // A. Borrar usuario existente (para resetear)
      const { data: existingProfiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', u.email)

      if (existingProfiles?.length) {
        for (const p of existingProfiles) {
          await supabase.auth.admin.deleteUser(p.id)
        }
      }

      // B. Crear Usuario en Auth
      const { data: user, error: createError } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password || 'password123',
        email_confirm: true,
        user_metadata: { full_name: u.full_name || `Test ${u.role.toUpperCase()}` }
      })

      if (createError) {
        results.push({ email: u.email, status: 'error', msg: createError.message })
        continue
      }

      // C. Actualizar Perfil con configuración específica
      if (user.user) {
        const targetTenant = u.role === 'master' ? null : tenant.id
        
        await supabase
          .from('profiles')
          .update({
            role: u.role,
            tenant_id: targetTenant,
            status: u.status || 'active',
            full_name: u.full_name || `Test ${u.role.toUpperCase()}`,
            force_reset: u.force_reset || false
          })
          .eq('id', user.user.id)
        
        results.push({ 
          email: u.email, 
          status: 'created', 
          role: u.role,
          profile_status: u.status || 'active',
          force_reset: u.force_reset || false
        })
      }
    }

    return new Response(JSON.stringify({ success: true, results }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500 
    })
  }
})