const params = new URLSearchParams(location.search);
const courseId = params.get("id");

// Validación básica
if (!courseId) {
  document.getElementById("courseContainer").innerHTML =
    "<p>Error: no se recibió ID del curso</p>";
}

// 1. obtener tenant y rol desde JWT
const { data: userData } = await supabase.auth.getUser();
const myTenantId = userData.user.user_metadata.tenant_id;
const myRole = userData.user.user_metadata.role;

// 2. cargar curso según permisos
let query = supabase.from("courses").select("content_json, tenant_id").eq("id", courseId);

// si NO eres master, aplicamos tenant
if (myRole !== "master") {
  query = query.eq("tenant_id", myTenantId);
}

const { data, error } = await query.single();

if (error || !data) {
  document.getElementById("courseContainer").innerHTML =
    "<p>No tienes acceso a este curso o no existe.</p>";
} else {
  loadCourse(data.content_json);
}
