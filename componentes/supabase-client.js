// js/supabase-client.js

// URL y Clave Pública de tu proyecto Supabase
const SUPABASE_URL = 'https://hvwygpnuunuuylzondxt.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2d3lncG51dW51dXlsem9uZHh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NDUzMTEsImV4cCI6MjA3NjEyMTMxMX0.FxjCX9epT_6LgWGdzdPhRUTP2vn4CLdixRqpFMRZK70';

// Crear y exportar el cliente de Supabase
// Usamos window.supabase para que sea fácil de acceder, igual que en index.html
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);