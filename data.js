/* =====================================================================
   OneDesk — Conexión a Supabase (data.js)
   -----------------------------------------------------------------
   Reemplaza el almacenamiento local (localStorage) por una base de
   datos real en la nube. Esto es lo que permite:
   1) Que tú puedas ver, desde el dashboard de Supabase, cuántos
      usuarios reales se registraron y qué tan activos están.
   2) Que el estado de pago no se pierda si la persona cambia de
      celular o borra el caché del navegador.
   3) Que el login funcione (cuentas reales, no datos sueltos por
      dispositivo).

   IMPORTANTE: reemplaza SUPABASE_URL y SUPABASE_ANON_KEY abajo con
   los valores reales de tu proyecto (Supabase → Settings → API).
   La "anon key" es pública a propósito — está diseñada para ir en
   el navegador. La seguridad real la dan las políticas RLS definidas
   en schema.sql, no esta clave.
   ===================================================================== */

const SUPABASE_URL = "https://crhamehpokvyakivbmbu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyaGFtZWhwb2t2eWFraXZibWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTAzNDksImV4cCI6MjA5NzYyNjM0OX0.6VXg5dmCeD6YCf-vVj3BqNVM2v9XdrZzI0E-vIQIw0g"

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let CURRENT_USER = null; // se llena al iniciar sesión

/* ===== Autenticación ===== */

async function signUp(email, password, businessName) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { business_name: businessName } },
  });
  if (error) return { ok: false, message: traducirErrorAuth(error) };
  CURRENT_USER = data.user;
  return { ok: true };
}

async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: traducirErrorAuth(error) };
  CURRENT_USER = data.user;
  return { ok: true };
}

async function signOut() {
  await supabaseClient.auth.signOut();
  CURRENT_USER = null;
}

async function getSession() {
  const { data } = await supabaseClient.auth.getSession();
  CURRENT_USER = data.session?.user ?? null;
  return data.session;
}

/* ===== Recuperar contraseña ===== */

// Manda un correo con un link especial. Ese link trae un token que
// Supabase usa para autenticar temporalmente a la persona SOLO para
// poder cambiar su contraseña (sin necesitar la contraseña vieja).
async function sendPasswordResetEmail(email) {
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) return { ok: false, message: traducirErrorAuth(error) };
  return { ok: true };
}

// Se llama cuando la persona ya entró desde el link del correo y escribió
// su contraseña nueva. En ese punto, Supabase ya la dejó "logueada"
// temporalmente gracias al token del link, así que esto solo actualiza
// la contraseña de esa sesión ya autenticada.
async function updatePassword(newPassword) {
  const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, message: traducirErrorAuth(error) };
  return { ok: true };
}

function traducirErrorAuth(error) {
  const msg = error.message || "";
  if (msg.includes("already registered")) return "Ese correo ya está registrado. Intenta iniciar sesión.";
  if (msg.includes("Invalid login")) return "Correo o contraseña incorrectos.";
  if (msg.includes("Password should be")) return "La contraseña debe tener al menos 6 caracteres.";
  return "Algo salió mal. Intenta de nuevo.";
}

/* ===== Perfil / estado de suscripción ===== */

async function fetchProfile() {
  if (!CURRENT_USER) return null;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", CURRENT_USER.id)
    .single();
  if (error) {
    console.warn("No se pudo leer el perfil:", error);
    return null;
  }
  return data;
}

/* ===== Clientes ===== */

async function dbGetClients() {
  const { data, error } = await supabaseClient
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}

async function dbCreateClient(client) {
  const { data, error } = await supabaseClient
    .from("clients")
    .insert({ ...client, owner_id: CURRENT_USER.id })
    .select()
    .single();
  if (error) { console.error(error); return null; }
  return data;
}

async function dbDeleteClient(id) {
  const { error } = await supabaseClient.from("clients").delete().eq("id", id);
  if (error) console.error(error);
}

/* ===== Sesiones (citas) ===== */

async function dbGetSessions() {
  const { data, error } = await supabaseClient.from("sessions").select("*");
  if (error) { console.error(error); return []; }
  return data;
}

async function dbCreateSession(session) {
  const { data, error } = await supabaseClient
    .from("sessions")
    .insert({ ...session, owner_id: CURRENT_USER.id })
    .select()
    .single();
  if (error) { console.error(error); return null; }
  return data;
}

async function dbToggleSessionDone(id, done) {
  const { error } = await supabaseClient.from("sessions").update({ done }).eq("id", id);
  if (error) console.error(error);
}

/* ===== Pagos ===== */

async function dbGetPayments() {
  const { data, error } = await supabaseClient
    .from("payments")
    .select("*")
    .order("date", { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}

async function dbCreatePayment(payment) {
  const { data, error } = await supabaseClient
    .from("payments")
    .insert({ ...payment, owner_id: CURRENT_USER.id })
    .select()
    .single();
  if (error) { console.error(error); return null; }
  return data;
}

/* ===== Recetas / nutrición ===== */

async function dbGetRecipes() {
  const { data, error } = await supabaseClient.from("recipes").select("*");
  if (error) { console.error(error); return []; }
  return data;
}

async function dbCreateRecipe(recipe) {
  const { data, error } = await supabaseClient
    .from("recipes")
    .insert({ ...recipe, owner_id: CURRENT_USER.id })
    .select()
    .single();
  if (error) { console.error(error); return null; }
  return data;
}

async function dbDeleteRecipe(id) {
  const { error } = await supabaseClient.from("recipes").delete().eq("id", id);
  if (error) console.error(error);
}

async function dbAssignRecipe(clientId, recipeId) {
  const { error } = await supabaseClient
    .from("client_recipes")
    .insert({ client_id: clientId, recipe_id: recipeId });
  if (error) console.error(error);
}

async function dbGetClientRecipes(clientId) {
  const { data, error } = await supabaseClient
    .from("client_recipes")
    .select("recipe_id, recipes(*)")
    .eq("client_id", clientId);
  if (error) { console.error(error); return []; }
  return data.map((row) => row.recipes);
}

/* ===== Nicho del negocio ===== */

async function dbSetNiche(niche) {
  const { error } = await supabaseClient
    .from("profiles")
    .update({ niche })
    .eq("id", CURRENT_USER.id);
  if (error) console.error(error);
  return !error;
}

/* ===== Feedback ("ayúdanos a mejorar la app") ===== */

async function dbSendFeedback(message, niche) {
  const { error } = await supabaseClient
    .from("feedback")
    .insert({ owner_id: CURRENT_USER?.id ?? null, message, niche: niche ?? null });
  if (error) { console.error(error); return false; }
  return true;
     }
