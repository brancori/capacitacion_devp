// supabase/functions/custom-login/index.ts

import { createClient } from "jsr:@supabase/supabase-js@2";

// --- IMPORTANTE: Headers de CORS movidos aquí ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
// ---------------------------------------------

Deno.serve(async (req) => {
  // --- MANEJO DE CORS (PREFLIGHT) ---
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  // ----------------------------------

  try {
    const { email, password, tenant_slug } = await req.json();

    if (!email || !password || !tenant_slug) {
      throw new Error("Email, password y tenant_slug son requeridos");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // 1. Crear cliente Admin (Service Role) para bypassear RLS
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Buscar el ID del tenant basado en el slug (ej: 'demo' -> uuid)
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", tenant_slug)
      .single();

    if (tenantError || !tenant) {
      // Si el slug no existe, comprobamos si el que llama es 'master'
      const { data: userByEmail } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("email", email)
        .single();
      
      if (userByEmail?.role !== 'master') {
         throw new Error("Tenant no encontrado o inválido.");
      }
    }

    // 3. Autenticar al usuario (validar email y contraseña)
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: authData, error: authError } = await supabase.auth
      .signInWithPassword({
        email: email,
        password: password,
      });

    if (authError) {
      throw new Error("Usuario o contraseña incorrectos.");
    }

    // 4. (Éxito de Auth) Ahora verificamos el *estado* en 'profiles'
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("status, tenant_id, role")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Perfil de usuario no encontrado.");
    }

    // 5. REGLAS DE NEGOCIO (Manifiesto)
    
    // Regla 0: Si es 'master', saltar validación de tenant
    if (profile.role !== 'master') {
      // Regla 1: ¿El usuario pertenece a este tenant?
      // Comprobamos que tenant.id exista antes de comparar
      if (!tenant || profile.tenant_id !== tenant.id) {
        throw new Error("Acceso denegado. El usuario no pertenece a este tenant.");
      }
    }

    // Regla 2: ¿El usuario está pendiente?
    if (profile.status === 'pending') {
      return new Response(
        JSON.stringify({
          error: "Cuenta pendiente de autorización. Contacta a tu administrador.",
          error_code: "PENDING_AUTHORIZATION",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401, // 401 Unauthorized
        },
      );
    }

    // Regla 3: ¿El usuario está suspendido o inactivo?
    if (profile.status === 'suspended' || profile.status === 'inactive') {
      return new Response(
        JSON.stringify({
          error: "Tu cuenta ha sido suspendida o está inactiva.",
          error_code: "ACCOUNT_SUSPENDED",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403, // 403 Forbidden
        },
      );
    }

    // Regla 4: ¿El usuario está activo?
    if (profile.status !== 'active') {
      throw new Error("La cuenta no está activa.");
    }

    // 6. ¡ÉXITO TOTAL!
// 6. ¡ÉXITO TOTAL! - ACTUALIZAR APP_METADATA EN EL JWT
    
    // Actualizar el app_metadata del usuario con rol y tenant_id
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      authData.user.id,
      {
        app_metadata: {
          role: profile.role,
          tenant_id: profile.tenant_id
        }
      }
    );

    if (updateError) {
      console.error('Error actualizando app_metadata:', updateError);
    }

    // Generar un nuevo JWT con el app_metadata actualizado
    const { data: refreshData } = await supabaseAdmin.auth.refreshSession({
      refresh_token: authData.session.refresh_token
    });

    const finalToken = refreshData?.session?.access_token || authData.session.access_token;

    return new Response(
      JSON.stringify({
        success: true,
        jwt: finalToken,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    // 7. Manejo de errores generales
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});