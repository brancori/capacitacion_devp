import { serve } from ‘https://deno.land/std@0.168.0/http/server.ts’
import { createClient } from ‘https://esm.sh/@supabase/supabase-js@2’

// Helper para logs estructurados
function log(stage: string, data: any) {
console.log(JSON.stringify({
timestamp: new Date().toISOString(),
stage,
…data
}));
}

serve(async (req) => {
const corsHeaders = {
‘Access-Control-Allow-Origin’: ‘*’,
‘Access-Control-Allow-Headers’: ‘authorization, x-client-info, apikey, content-type’,
}

if (req.method === ‘OPTIONS’) {
return new Response(‘ok’, { headers: corsHeaders })
}

const requestId = crypto.randomUUID().split(’-’)[0];

try {
log(‘REQUEST_START’, { requestId, method: req.method });

const { email, password, tenant_slug } = await req.json()
log('BODY_PARSED', { requestId, email, tenant_slug, hasPassword: !!password });

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)
log('SUPABASE_CLIENT_CREATED', { requestId });

// 1. Verificar tenant
log('TENANT_CHECK_START', { requestId, tenant_slug });
const { data: tenant, error: tenantError } = await supabase
  .from('tenants')
  .select('id')
  .eq('slug', tenant_slug)
  .single()

if (tenantError) {
  log('TENANT_ERROR', { requestId, error: tenantError.message, code: tenantError.code });
}

if (!tenant) {
  log('TENANT_NOT_FOUND', { requestId, tenant_slug });
  return new Response(
    JSON.stringify({ error: 'Tenant inválido', error_code: 'INVALID_TENANT' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
  )
}

log('TENANT_FOUND', { requestId, tenant_id: tenant.id });

// 2. Login
log('AUTH_START', { requestId, email });
const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email,
  password
})

if (authError) {
  log('AUTH_FAILED', { requestId, error: authError.message, code: authError.code });
  return new Response(
    JSON.stringify({ error: authError.message, error_code: 'AUTH_ERROR' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
  )
}

log('AUTH_SUCCESS', { requestId, user_id: authData.user.id, has_session: !!authData.session });

// 3. Verificar profile
log('PROFILE_CHECK_START', { requestId, user_id: authData.user.id });
const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('role, tenant_id, force_reset') 
  .eq('id', authData.user.id)
  .single();

if (profileError) {
  log('PROFILE_ERROR', { requestId, error: profileError.message, code: profileError.code });
}

if (!profile) {
  log('PROFILE_NOT_FOUND', { requestId, user_id: authData.user.id });
  return new Response(
    JSON.stringify({ error: 'Perfil no encontrado', error_code: 'NO_PROFILE' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
  )
}

log('PROFILE_FOUND', { 
  requestId, 
  role: profile.role, 
  tenant_id: profile.tenant_id, 
  force_reset: profile.force_reset 
});

// Verificar tenant match
if (profile.role !== 'master' && profile.tenant_id !== tenant.id) {
  log('TENANT_MISMATCH', { 
    requestId, 
    profile_tenant: profile.tenant_id, 
    login_tenant: tenant.id,
    role: profile.role 
  });
  return new Response(JSON.stringify({
    error: 'Acceso denegado: No perteneces a este tenant',
    error_code: 'WRONG_TENANT'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 403
  });
}

log('TENANT_MATCH_OK', { requestId });

if (profile.force_reset) {
  log('FORCE_RESET_REQUIRED', { requestId, user_id: authData.user.id });
  return new Response(
    JSON.stringify({ 
      error: 'Cambio de contraseña requerido', 
      error_code: 'FORCE_RESET',
      user_id: authData.user.id
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
  )
}

// 4. 🔥 DEVOLVER JWT
log('PREPARING_RESPONSE', { 
  requestId, 
  has_jwt: !!authData.session?.access_token,
  jwt_length: authData.session?.access_token?.length,
  role: profile.role 
});

const response = {
  jwt: authData.session.access_token,
  user: authData.user,
  role: profile.role
};

log('SUCCESS', { 
  requestId, 
  user_id: authData.user.id, 
  role: profile.role,
  response_has_jwt: !!response.jwt 
});

return new Response(
  JSON.stringify(response),
  { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
)


} catch (error) {
log(‘UNEXPECTED_ERROR’, {
requestId,
error: error.message,
name: error.name,
stack: error.stack
});
return new Response(
JSON.stringify({
error: error.message,
error_code: ‘SERVER_ERROR’,
request_id: requestId
}),
{ headers: { …corsHeaders, ‘Content-Type’: ‘application/json’ }, status: 500 }
)
}
})