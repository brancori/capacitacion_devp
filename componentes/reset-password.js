import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejar CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Cliente admin de Supabase
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // Verificar token del usuario
    const authHeader = req.headers.get('Authorization')
    const token = authHeader.replace('Bearer ', '')
    
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !userData.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'No autorizado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Verificar que sea admin o master
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', userData.user.id)
      .single()

    if (profileError || !profile || (profile.role !== 'admin' && profile.role !== 'master')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Permisos insuficientes' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // Obtener datos del request
    const body = await req.json()
    const userId = body.userId

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'userId es requerido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Generar contraseña temporal
    const tempPassword = generatePassword(12)

    // Actualizar contraseña en Supabase Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: tempPassword }
    )

    if (updateError) {
      throw new Error('Error al actualizar contraseña: ' + updateError.message)
    }

    // Marcar force_reset y desautorizar
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        force_reset: true,
        autorizado: false
      })
      .eq('user_id', userId)

    if (profileUpdateError) {
      throw new Error('Error al actualizar perfil: ' + profileUpdateError.message)
    }

    // Respuesta exitosa
    return new Response(
      JSON.stringify({ 
        success: true, 
        tempPassword: tempPassword,
        message: 'Contraseña reseteada exitosamente'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error en reset-password:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Error desconocido'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

// Función para generar contraseña segura
function generatePassword(length) {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const numbers = '0123456789'
  const symbols = '!@#$%&*'
  
  const allChars = lowercase + uppercase + numbers + symbols
  let password = ''
  
  // Asegurar al menos un caracter de cada tipo
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += symbols[Math.floor(Math.random() * symbols.length)]
  
  // Completar el resto
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)]
  }
  
  // Mezclar
  return password.split('').sort(() => Math.random() - 0.5).join('')
}