/* =====================================================================
   OneDesk — Vocabulario por nicho (vocab.js)
   -----------------------------------------------------------------
   Esto NO cambia los datos ni la base de datos — solo las PALABRAS
   que ve la persona en pantalla, según a qué se dedique. Mismo core,
   distinto "idioma" según el negocio.

   Si más adelante un nicho necesita de verdad un campo distinto (no
   solo una palabra distinta), eso ya sería un paso más grande — se
   decide con evidencia real de los usuarios de ese nicho, no antes.
   ===================================================================== */

const NICHES = {
  entrenador: {
    label: "Entrenador personal",
    icon: "💪",
    client: "cliente",
    clientPlural: "clientes",
    clientGoalLabel: "Objetivo",
    clientGoalPlaceholder: "Ej. Pérdida de grasa, fuerza, movilidad…",
    sessionLabel: "sesión",
    sessionPlural: "sesiones",
    sessionVerb: "Agendar sesión",
    emptyClients: "Aún no tienes clientes. Agrega el primero para empezar a llevar su historial, sesiones y pagos en un solo lugar.",
  },
  peluquero: {
    label: "Peluquería / Barbería",
    icon: "💇",
    client: "cliente",
    clientPlural: "clientes",
    clientGoalLabel: "Preferencias",
    clientGoalPlaceholder: "Ej. Corte degradado, sin máquina en la corona…",
    sessionLabel: "cita",
    sessionPlural: "citas",
    sessionVerb: "Agendar cita",
    emptyClients: "Aún no tienes clientes. Agrega el primero para llevar su historial de cortes, citas y pagos en un solo lugar.",
  },
  taller: {
    label: "Taller mecánico",
    icon: "🔧",
    client: "vehículo",
    clientPlural: "vehículos",
    clientGoalLabel: "Datos del vehículo",
    clientGoalPlaceholder: "Ej. Placas, modelo, kilometraje…",
    sessionLabel: "orden de trabajo",
    sessionPlural: "órdenes de trabajo",
    sessionVerb: "Agendar entrada de taller",
    emptyClients: "Aún no tienes vehículos registrados. Agrega el primero para llevar su historial de reparaciones, citas y pagos en un solo lugar.",
  },
  otro: {
    label: "Otro tipo de negocio",
    icon: "📋",
    client: "cliente",
    clientPlural: "clientes",
    clientGoalLabel: "Notas",
    clientGoalPlaceholder: "Cualquier dato que quieras recordar de este cliente…",
    sessionLabel: "cita",
    sessionPlural: "citas",
    sessionVerb: "Agendar cita",
    emptyClients: "Aún no tienes clientes. Agrega el primero para llevar su historial, citas y pagos en un solo lugar.",
  },
};

const DEFAULT_NICHE = "otro";

function getVocab(nicheKey) {
  return NICHES[nicheKey] || NICHES[DEFAULT_NICHE];
}

/* Aplica el vocabulario del nicho elegido a los textos visibles de la
   interfaz. Se llama una vez al entrar, y de nuevo si el usuario cambia
   su nicho desde ajustes. No toca nombres de campos en la base de datos,
   solo lo que la persona lee en pantalla. */
function applyVocab(nicheKey) {
  const v = getVocab(nicheKey);

  document.getElementById("clientSearch").placeholder = `Buscar ${v.client}…`;
  document.getElementById("clientsEmpty").querySelector("p").textContent = v.emptyClients;
  document.getElementById("clientsEmpty").querySelector("button").textContent = `Agregar ${v.client}`;

  document.querySelector('label[for="cGoal"]').textContent = v.clientGoalLabel;
  document.getElementById("cGoal").placeholder = v.clientGoalPlaceholder;

  document.getElementById("todayEmpty").querySelector("p").textContent = `No tienes ${v.sessionPlural} agendadas para hoy.`;
  document.getElementById("todayEmpty").querySelector("button").textContent = v.sessionVerb;

  document.querySelectorAll('[data-vocab="sessionVerb"]').forEach((el) => (el.textContent = v.sessionVerb));
}
