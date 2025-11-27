// supabase/functions/cron-notifications/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  // 1. Buscar asignaciones que vencen en 3 días exactos y no están completadas
  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + 3)
  const dateStr = targetDate.toISOString().split('T')[0] // YYYY-MM-DD

  const { data: assignments, error } = await supabase
    .from('user_course_assignments')
    .select('user_id, course_id, due_date, articles(title)')
    .eq('status', 'assigned')
    .eq('due_date', dateStr)

  if (error) return new Response(JSON.stringify({ error }), { status: 400 })
  if (!assignments || assignments.length === 0) return new Response('No notifications needed', { status: 200 })

  // 2. Preparar notificaciones
  const notifications = assignments.map(a => ({
    user_id: a.user_id,
    title: 'Curso por vencer',
    message: `El curso "${a.articles.title}" vence en 3 días.`,
    type: 'urgent',
    link: `/profile/curso/curso.html?id=${a.course_id}`
  }))

  // 3. Insertar masivamente
  const { error: insertError } = await supabase
    .from('notifications')
    .insert(notifications)

  if (insertError) return new Response(JSON.stringify({ insertError }), { status: 400 })

  return new Response(JSON.stringify({ sent: notifications.length }), { headers: { 'Content-Type': 'application/json' } })
})