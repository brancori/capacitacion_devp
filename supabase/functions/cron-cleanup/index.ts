// supabase/functions/cron-cleanup/index.ts

import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    // Usamos la Service Role Key para tener permisos de administrador (bypasea RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Definir la fecha actual ISO
    const nowISO = new Date().toISOString();

    // Borra solicitudes de registro que:
    // 1. Han expirado (expires_at < hoy)
    // 2. Siguen en estado 'pending' (para no borrar historial de aprobados/rechazados)
    const { error, count } = await supabaseAdmin
      .from("registration_requests") // ⚠️ CORREGIDO: Antes decía pending_registrations
      .delete({ count: 'exact' })
      .lt("expires_at", nowISO)
      .eq("status", "pending");

    if (error) {
      console.error("Error limpiando registros:", error);
      throw error;
    }

    console.log(`🧹 Limpieza completada. Se eliminaron ${count} solicitudes expiradas.`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Limpieza completada.", 
        deleted_count: count 
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});