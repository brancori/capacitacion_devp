// ==========================================
// PROFILE DATA - Lógica y Datos
// ==========================================

window.safeStorage = window.safeStorage || {
  set: (k, v) => { try { localStorage.setItem(k, v) } catch(e){} },
  get: (k) => { try { return localStorage.getItem(k) } catch(e){ return null } },
  remove: (k) => { try { localStorage.removeItem(k) } catch(e){} }
};

async function waitForSupabase() {
  let i = 0;
  while (!window.supabase && i < 50) {
    await new Promise(r => setTimeout(r, 100));
    i++;
  }
  return window.supabase;
}

async function getTenantConfig() {
  const host = location.hostname;
  let slug = 'default';
  
  if (host === 'localhost') slug = 'demo';
  else if (host.split('.').length > 2) slug = host.split('.')[0];

  try {
    const res = await fetch('../tenants/tenants.json', { cache: 'no-store' });
    const data = await res.json();
    return data[slug] || data['default'] || {};
  } catch (e) {
    return {};
  }
}

async function validateSessionAndRole(supabase) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  let role = window.safeStorage.get('role');
  
  if (!role || role === 'authenticated') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name, tenant_id')
      .eq('id', session.user.id)
      .single();

    if (profile) {
      role = profile.role;
      window.safeStorage.set('role', profile.role);
      window.safeStorage.set('full_name', profile.full_name);
      window.safeStorage.set('tenant', profile.tenant_id);
    }
  }

  // Retornar objeto usuario completo
  return { 
    id: session.user.id, 
    role: role,
    fullName: window.safeStorage.get('full_name'),
    tenantId: window.safeStorage.get('tenant')
  };
}

async function fetchUserDashboardData(supabase, userId) {
  try {
    const [assigns, badges, myBadges, logs] = await Promise.all([
      supabase.from('user_course_assignments')
        .select('*, articles:course_id(id, title, duration_text)')
        .eq('user_id', userId),
      supabase.from('badges').select('*'),
      supabase.from('user_badges').select('badge_id').eq('user_id', userId),
      supabase.from('activity_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)
    ]);

    return {
      assignments: assigns.data || [],
      allBadges: badges.data || [],
      myBadgesIds: new Set((myBadges.data || []).map(b => b.badge_id)),
      logs: logs.data || []
    };
  } catch (e) {
    console.error('Error fetching data:', e);
    return null;
  }
}