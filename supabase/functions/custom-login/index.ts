// supabase/functions/custom-login/index.ts

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password, tenant_slug } = await req.json();

    if (!email || !password || !tenant_slug) {
      throw new Error("Email, password y tenant_slug son requeridos");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // 1. Crear cliente Admin (Service Role) para bypassear RLS
    // Lo usaremos para leer tablas internas de forma segura
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Buscar el ID del tenant basado en el slug (ej: 'demo' -> uuid)
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", tenant_slug)
      .single();

    if (tenantError || !tenant) {
      throw new Error("Tenant no encontrado o inválido.");
    }

    // 3. Autenticar al usuario (validar email y contraseña)
    // Usamos el cliente 'anon' estándar para esto
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
    // Usamos el cliente Admin otra vez
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("status, tenant_id")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Perfil de usuario no encontrado.");
    }

    // 5. REGLAS DE NEGOCIO (Manifiesto)
    
    // Regla 1: ¿El usuario pertenece a este tenant?
    if (profile.tenant_id !== tenant.id) {
      throw new Error("Acceso denegado. El usuario no pertenece a este tenant.");
    }

    // Regla 2: ¿El usuario está pendiente?
    if (profile.status === 'pending') {
      // Este 'error_code' especial es detectado por index2.js
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
    // El usuario está autenticado, pertenece al tenant y está activo.
    // Devolvemos el JWT que nos dio signInWithPassword.
    // Ese JWT ya tiene los claims (role, tenant_id) porque
    // los pusimos en 'app_metadata' durante 'approve-registration'.
    
    return new Response(
      JSON.stringify({
        success: true,
        jwt: authData.session.access_token,
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