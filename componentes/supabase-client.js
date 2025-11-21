// componentes/supabase-client.js

// URL y Clave Pública de tu proyecto Supabase
const SUPABASE_URL = window.location.origin + '/api';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2d3lncG51dW51dXlsem9uZHh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NDUzMTEsImV4cCI6MjA3NjEyMTMxMX0.FxjCX9epT_6LgWGdzdPhRUTP2vn4CLdixRqpFMRZK70';

// IMPORTANTE: Esperar a que la librería de Supabase esté cargada
if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
  console.error('❌ La librería de Supabase no está cargada. Asegúrate de incluir el CDN antes de este script.');
} else {
  // Crear el cliente de Supabase y hacerlo global
  window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
  console.log('✅ Cliente de Supabase inicializado correctamente');
}

// --- Manejo del Logout ---
function setupLogoutButton() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      console.log('Cerrando sesión...');
      
      const { error } = await window.supabase.auth.signOut();
      
      if (error) {
        console.error('Error al cerrar sesión:', error.message);
      } else {
        window.location.href = '../index.html';
      }
    });
  }
}

// Configurar el botón de logout cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupLogoutButton);
} else {
  setupLogoutButton();
}