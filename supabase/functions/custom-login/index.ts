import { createClient } from "jsr:@supabase/supabase-js@2";

// ✅ CORRECCIÓN: Headers CORS completos según documentación oficial
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name, x-requested-with',
};

Deno.serve(async (req) => {
  // ✅ CRÍTICO: El OPTIONS debe estar PRIMERO, antes de cualquier otra lógica
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      headers: corsHeaders,
      status: 204 
    });
  }

  try {
    const { email, password, tenant_slug } = await req.json();

    if (!email || !password || !tenant_slug) {
      throw new Error("Email, password y tenant_slug son requeridos");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Validar Tenant
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", tenant_slug)
      .single();

    if (tenantError || !tenant) {
      const { data: userByEmail } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("email", email)
        .single();
      
      if (userByEmail?.role !== 'master') {
         throw new Error("Tenant no encontrado o inválido.");
      }
    }

    // 3. Autenticar
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: authData, error: authError } = await supabase.auth
      .signInWithPassword({
        email: email,
        password: password,
      });

    if (authError) {
      throw new Error("Usuario o contraseña incorrectos.");
    }

    // 4. Verificar Perfil
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("status, tenant_id, role, force_reset")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Perfil de usuario no encontrado.");
    }

    // 🛑 Bloqueo por cambio de contraseña forzoso
    if (profile.force_reset === true) {
      return new Response(
        JSON.stringify({ 
          error: 'Password reset required', 
          error_code: 'FORCE_RESET', 
          user_id: authData.user.id 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200 
        }
      );
    }

    // 5. Reglas de Negocio
    if (profile.role !== 'master') {
      if (!tenant || profile.tenant_id !== tenant.id) {
        throw new Error("Acceso denegado. El usuario no pertenece a este tenant.");
      }
    }

    if (profile.status === 'pending') {
      return new Response(
        JSON.stringify({
          error: "Cuenta pendiente de autorización. Contacta a tu administrador.",
          error_code: "PENDING_AUTHORIZATION",
        }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" }, 
          status: 401 
        }
      );
    }

    if (profile.status === 'suspended' || profile.status === 'inactive') {
      return new Response(
        JSON.stringify({
          error: "Tu cuenta ha sido suspendida o está inactiva.",
          error_code: "ACCOUNT_SUSPENDED",
        }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" }, 
          status: 403 
        }
      );
    }

    if (profile.status !== 'active') {
      throw new Error("La cuenta no está activa.");
    }

    // 6. Actualizar app_metadata y retornar Token
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      authData.user.id,
      {
        app_metadata: {
          role: profile.role,
          tenant_id: profile.tenant_id
        }
      }
    );

    if (updateError) console.error('Error actualizando app_metadata:', updateError);

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
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});