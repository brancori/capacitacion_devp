// supabase/functions/approve-registration/index.ts

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "shared/cors.ts";
// *** NOTA: ¡Implementación de crypto NO incluida en la documentación! ***
// import { decrypt } from "../_shared/crypto.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. OBTENER EL CONTEXTO DE AUTENTICACIÓN DEL ADMIN
    // Esto es crucial para la seguridad. [cite: 225, 233]
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Se requiere autorización (Admin/Master)");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Cliente para verificar al admin que llama
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    }); [cite: 225]

    // 2. VERIFICAR PERMISOS DEL ADMIN
    // Obtenemos el usuario (admin) que hace la llamada [cite: 227]
    const { data: { user: adminUser } } = await supabaseClient.auth.getUser();
    if (!adminUser) {
      throw new Error("Token de admin inválido");
    }

    // Leemos el rol del admin desde su perfil
    // (RLS permite a los usuarios leer su propio perfil)
    const { data: adminProfile } = await supabaseClient
      .from("profiles")
      .select("role, tenant_id")
      .eq("id", adminUser.id)
      .single();

    if (!adminProfile || !['admin', 'master'].includes(adminProfile.role)) {
      throw new Error("Acción no autorizada. Se requiere rol 'admin' o 'master'.");
    }

    // 3. OBTENER DATOS DE LA SOLICITUD
    const { pending_id, assign_role } = await req.json();
    if (!pending_id || !assign_role) {
      throw new Error("Faltan 'pending_id' y 'assign_role'");
    }

    // 4. CREAR CLIENTE ADMIN (SERVICE ROLE)
    // Este cliente bypassea RLS 
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 5. OBTENER EL REGISTRO PENDIENTE
    const { data: pending, error: pendingError } = await supabaseAdmin
      .from("pending_registrations")
      .select("*")
      .eq("id", pending_id)
      .single();

    if (pendingError || !pending) {
      throw new Error("Solicitud pendiente no encontrada.");
    }

    // 6. VALIDAR PERMISOS DEL ADMIN (Defensa en profundidad)
    if (adminProfile.role === 'admin') {
      const { data: tenant } = await supabaseAdmin
        .from("tenants")
        .select("slug")
        .eq("id", adminProfile.tenant_id)
        .single();
      
      if (pending.tenant_slug !== tenant.slug) {
        throw new Error("Admin no puede aprobar solicitudes de otro tenant.");
      }
    }
    
    // 7. OBTENER TENANT ID
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", pending.tenant_slug)
      .single();

    if (!tenant) {
      throw new Error(`Tenant con slug '${pending.tenant_slug}' no encontrado.`);
    }

    // *** 8. PLACEHOLDER DE DESCIFRADO (NO DOCUMENTADO) ***
    // const ENCRYPTION_SECRET = Deno.env.get("ENCRYPTION_SECRET");
    // const decryptedPassword = await decrypt(pending.encrypted_password, ENCRYPTION_SECRET);
    //
    // **** PLACEHOLDER - ¡REEMPLAZAR! ****
    const decryptedPassword = pending.encrypted_password.replace("PLAINTEXT:", "");
    // ¡¡¡REEMPLAZAR ARRIBA!!!

    // 9. CREAR USUARIO EN AUTH.USERS
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: pending.email,
      password: decryptedPassword,
      email_confirm: true, // Se recomienda, aunque el manifiesto no lo pide
      // AQUÍ ESTÁ LA MAGIA: Seteamos los claims del JWT [cite: 68, 179]
      app_metadata: {
        role: assign_role,
        tenant_id: tenant.id,
        user_type: pending.user_type
      }
    });

    if (authError) {
      throw new Error(`Error al crear usuario en Auth: ${authError.message}`);
    }

    // 10. CREAR PERFIL EN PUBLIC.PROFILES
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: authUser.user.id,
      email: pending.email,
      full_name: pending.full_name,
      tenant_id: tenant.id,
      role: assign_role,
      user_type: pending.user_type,
      status: 'active', // Aprobado = activo
      metadata: pending.meta
    });

    if (profileError) {
      // Rollback: si falla el perfil, borrar el usuario de Auth
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      throw new Error(`Error al crear perfil: ${profileError.message}`);
    }

    // 11. LIMPIAR REGISTRO PENDIENTE
    await supabaseAdmin.from("pending_registrations").delete().eq("id", pending.id);
    
    // 12. (Opcional) Guardar Log
    await supabaseAdmin.from("auth_logs").insert({
      user_email: pending.email,
      event_type: 'registration_approved',
      actor_id: adminUser.id,
      details: {
        tenant_id: tenant.id,
        assigned_role: assign_role
      }
    });

    return new Response(
      JSON.stringify({ success: true, user: authUser.user }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 201, // 201 Created
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