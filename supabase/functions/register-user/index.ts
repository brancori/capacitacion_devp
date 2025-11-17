// supabase/functions/register-user/index.ts

import { createClient } from "jsr:@supabase/supabase-js@2";

// --- IMPORTANTE: Headers de CORS movidos aquí ---
// Esto elimina la dependencia de _shared/cors.ts
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

    // --- ¡ADVERTENCIA DE SEGURIDAD! ---
    // ¡REEMPLAZAR ANTES DE PRODUCIR!
    const encrypted_password = `PLAINTEXT:${password}`;
    // ----------------------------------

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "", 
    );

    const { error } = await supabase.from("pending_registrations").insert({
      email,
      full_name,
      tenant_slug,
      user_type: user_type || 'employee',
      encrypted_password: encrypted_password,
      meta: meta || {},
    });

    if (error) {
      throw new Error(`Error al crear solicitud: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Solicitud de registro recibida.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 202, 
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