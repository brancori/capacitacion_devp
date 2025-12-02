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
    // Cliente Super Admin
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Asegurar Tenant
    let { data: tenant } = await supabase.from('tenants').select('id').eq('slug', 'test-suite').single();
    
    if (!tenant) {
        const { data: newTenant } = await supabase
            .from('tenants')
            .insert({ name: 'Test Suite Tenant', slug: 'test-suite' })
            .select('id')
            .single();
        tenant = newTenant;
    }

    const users = [
      { email: 'test.master@test.com', role: 'master' },
      { email: 'test.admin@test.com', role: 'admin' },
      { email: 'test.supervisor@test.com', role: 'supervisor' },
      { email: 'test.auditor@test.com', role: 'auditor' },
      { email: 'test.user@test.com', role: 'user' },
    ]

    const results = [];

    for (const u of users) {
      // A. Borrar usuario existente (para resetear password)
      const { data: profiles } = await supabase.from('profiles').select('id').eq('email', u.email);
      if (profiles?.length) {
          for (const p of profiles) await supabase.auth.admin.deleteUser(p.id);
      }

      // B. Crear Usuario (API genera el hash correcto siempre)
      const { data: user, error: createError } = await supabase.auth.admin.createUser({
        email: u.email,
        password: 'password123',
        email_confirm: true,
        user_metadata: { full_name: `Test ${u.role.toUpperCase()}` }
      });

      if (createError) {
          results.push({ email: u.email, status: 'error', msg: createError.message });
          continue;
      }

      // C. Ajustar Perfil (Rol y Tenant)
      if (user.user) {
        const targetTenant = u.role === 'master' ? null : tenant.id;
        
        await supabase.from('profiles').update({
          role: u.role,
          tenant_id: targetTenant,
          status: 'active',
          full_name: `Test ${u.role.toUpperCase()}`,
          force_reset: false
        }).eq('id', user.user.id);
        
        results.push({ email: u.email, status: 'created', role: u.role });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
    });
  }
})