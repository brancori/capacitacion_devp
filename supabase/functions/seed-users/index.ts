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
      cleanup = false,
      tenant_slug = 'test-suite',
      custom_users = null,
      force_recreate = false  // Nuevo: forzar recreación completa
    } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log(`🔧 [seed-users] Iniciando - cleanup: ${cleanup}, force_recreate: ${force_recreate}`)

    // PASO 0: LIMPIEZA (si se solicita)
    if (cleanup) {
      console.log('🧹 Limpiando usuarios de prueba...')
      
      const { data: testProfiles } = await supabase
        .from('profiles')
        .select('id, email')
        .or('email.like.test.%@test.com,email.like.pending.%@test.com,email.like.forcereset.%@test.com,email.like.othertenant.%@test.com')

      if (testProfiles?.length) {
        console.log(`   Eliminando ${testProfiles.length} perfiles de prueba`)
        for (const profile of testProfiles) {
          await supabase.auth.admin.deleteUser(profile.id)
          console.log(`   ✓ Eliminado: ${profile.email}`)
        }
      }

      // Si custom_users está explícitamente vacío, solo limpiar
      if (custom_users !== null && custom_users.length === 0) {
        return new Response(JSON.stringify({ success: true, cleaned: testProfiles?.length || 0 }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        })
      }
    }

    // PASO 1: Asegurar Tenant
    let { data: tenant } = await supabase
      .from('tenants')
      .select('id, slug')
      .eq('slug', tenant_slug)
      .single()
    
    if (!tenant) {
      console.log(`📦 Creando tenant: ${tenant_slug}`)
      const { data: newTenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({ name: 'Test Suite Tenant', slug: tenant_slug })
        .select('id, slug')
        .single()
      
      if (tenantError) throw new Error(`Error creando tenant: ${tenantError.message}`)
      tenant = newTenant
    }

    console.log(`✓ Tenant confirmado: ${tenant.slug} (${tenant.id})`)

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
    const PASSWORD = 'password123' // Contraseña consistente

    console.log(`👥 Procesando ${usersToCreate.length} usuarios...`)

    // PASO 3: Crear/Actualizar usuarios
    for (const u of usersToCreate) {
      console.log(`\n📝 Procesando: ${u.email}`)
      
      try {
        // A. Verificar si ya existe
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id, email, role')
          .eq('email', u.email)
          .single()

        let userId: string

        if (existingProfile && !force_recreate) {
          // ACTUALIZAR usuario existente
          console.log(`   ℹ️ Usuario ya existe, actualizando perfil...`)
          userId = existingProfile.id

          // Actualizar contraseña en Auth (por si acaso)
          await supabase.auth.admin.updateUserById(userId, {
            password: u.password || PASSWORD
          })
          console.log(`   ✓ Contraseña actualizada`)

        } else {
          // CREAR usuario nuevo
          if (existingProfile) {
            console.log(`   🗑️ Eliminando usuario existente para recrear...`)
            await supabase.auth.admin.deleteUser(existingProfile.id)
            // Esperar a que se complete la eliminación
            await new Promise(resolve => setTimeout(resolve, 500))
          }

          console.log(`   ➕ Creando usuario en Auth...`)
          const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
            email: u.email,
            password: u.password || PASSWORD,
            email_confirm: true,
            user_metadata: { full_name: u.full_name || `Test ${u.role?.toUpperCase()}` }
          })

          if (createError) {
            throw new Error(`Error en Auth: ${createError.message}`)
          }

          if (!authUser?.user) {
            throw new Error('No se recibió user ID de Auth')
          }

          userId = authUser.user.id
          console.log(`   ✓ Usuario creado en Auth (ID: ${userId.substring(0, 8)}...)`)
        }

        // B. Actualizar/Crear perfil
        const targetTenant = u.role === 'master' ? null : tenant.id
        
        console.log(`   📋 Configurando perfil: role=${u.role}, status=${u.status || 'active'}, force_reset=${u.force_reset || false}`)
        
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: userId,
            email: u.email,
            role: u.role || 'user',
            tenant_id: targetTenant,
            status: u.status || 'active',
            full_name: u.full_name || `Test ${(u.role || 'user').toUpperCase()}`,
            force_reset: u.force_reset || false
          }, { onConflict: 'id' })

        if (profileError) {
          throw new Error(`Error actualizando perfil: ${profileError.message}`)
        }

        console.log(`   ✅ Perfil configurado correctamente`)
        
        results.push({ 
          email: u.email, 
          status: 'success', 
          role: u.role,
          profile_status: u.status || 'active',
          force_reset: u.force_reset || false,
          action: existingProfile && !force_recreate ? 'updated' : 'created'
        })

      } catch (err) {
        console.error(`   ❌ Error procesando ${u.email}:`, err.message)
        results.push({ 
          email: u.email, 
          status: 'error', 
          message: err.message 
        })
      }
    }

    console.log(`\n✅ Proceso completado: ${results.filter(r => r.status === 'success').length}/${results.length} exitosos`)

    return new Response(JSON.stringify({ 
      success: true, 
      results,
      tenant: { id: tenant.id, slug: tenant.slug }
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    })

  } catch (error) {
    console.error('❌ Error general:', error.message)
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500 
    })
  }
})