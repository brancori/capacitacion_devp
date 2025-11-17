import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
// *** NOTA: ¡Implementación de crypto NO incluida en la documentación! ***
// Necesitarás importar y usar una librería o API nativa de Deno.
// import { encrypt } from "../_shared/crypto.ts";

Deno.serve(async (req) => {
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

    // *** PLACEHOLDER DE CIFRADO (NO DOCUMENTADO) ***
    // Esta es una operación de encriptación simétrica requerida por el manifiesto.
    // const ENCRYPTION_SECRET = Deno.env.get("ENCRYPTION_SECRET");
    // const encrypted_password = await encrypt(password, ENCRYPTION_SECRET);
    //
    // **** POR AHORA, USAREMOS UN TEXTO PLANO COMO PLACEHOLDER ****
    // **** ¡¡¡NO USAR EN PRODUCCIÓN!!! ****
    // ¡¡¡REEMPLAZAR ANTES DE PRODUCIR!!!
    const encrypted_password = `PLAINTEXT:${password}`;
    // ¡¡¡REEMPLAZAR ARRIBA!!!

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "", // Usa anon key para RLS
    );

    // Insertar en la tabla 'pending_registrations'
    // La política RLS permite esto para 'anon'
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
        status: 202, // 202 Accepted (Aceptado para procesamiento)
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