// supabase/functions/register-user/index.ts

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // CORS PREFLIGHT
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      email,
      password,
      full_name,
      tenant_slug,
      user_type,
      meta,
    } = await req.json();

    if (!email || !password || !tenant_slug || !full_name) {
      throw new Error("Faltan campos requeridos: email, password, full_name, tenant_slug");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", // ← USAR SERVICE_ROLE para bypass RLS
    );

    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR EL TENANT_ID desde el slug
    // ═══════════════════════════════════════════════════════════
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenant_slug)
      .single();

    if (tenantError || !tenant) {
      throw new Error(`Tenant '${tenant_slug}' no encontrado en la base de datos`);
    }

    console.log(`✅ Tenant encontrado: ${tenant_slug} → ${tenant.id}`);

    // ⚠️ ADVERTENCIA: Encriptación simple (REEMPLAZAR en producción)
    const encrypted_password = `PLAINTEXT:${password}`;

    // ═══════════════════════════════════════════════════════════
    // 2. INSERTAR CON tenant_id Y tenant_slug
    // ═══════════════════════════════════════════════════════════
    const { error: insertError } = await supabase
      .from("registration_requests")
      .insert({
        email,
        full_name,
        tenant_slug,
        tenant_id: tenant.id,  // ← AGREGAR tenant_id
        user_type: user_type || 'employee',
        encrypted_password: encrypted_password,
        meta: meta || {},
        status: 'pending',
      });

    if (insertError) {
      throw new Error(`Error al crear solicitud: ${insertError.message}`);
    }

    console.log(`📩 Solicitud creada para ${email} en tenant ${tenant_slug}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Solicitud de registro recibida y pendiente de aprobación.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 202, 
      },
    );
  } catch (err) {
    console.error('❌ Error en register-user:', err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});