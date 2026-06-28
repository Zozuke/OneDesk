/* =====================================================================
   OneDesk — lógica de la app
   -----------------------------------------------------------------
   Persistencia: Supabase (base de datos real en la nube) es ahora la
   fuente de verdad. DATA sigue existiendo como una "caché en memoria"
   para que todas las funciones de pantalla (renderHoy, renderClients,
   etc.) sigan funcionando exactamente igual que antes — sin reescribir
   cada función una por una. Cada acción de guardar ahora escribe
   primero a Supabase y, si funciona, actualiza DATA y vuelve a pintar.

   Por qué se hizo así: reescribir cada función de pantalla a async
   sin poder probarlo contra tu base de datos real (no tengo tus
   credenciales de Supabase aquí) sería un riesgo innecesario de bugs
   silenciosos. Este enfoque reutiliza el 95% del código ya probado.
   ===================================================================== */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function defaultData() {
  return { clients: [], sessions: [], payments: [], recipes: [], clientRecipes: {} };
}

let DATA = defaultData();

// Trae todo de Supabase y llena la caché local DATA.
async function syncFromSupabase() {
  const [clients, sessions, payments, recipes] = await Promise.all([
    dbGetClients(),
    dbGetSessions(),
    dbGetPayments(),
    dbGetRecipes(),
  ]);

  DATA.clients = clients.map((c) => ({
    id: c.id, name: c.name, phone: c.phone, fee: c.fee, plan: c.plan,
    goal: c.goal, createdAt: c.created_at, recipeIds: [],
  }));
  DATA.sessions = sessions.map((s) => ({
    id: s.id, clientId: s.client_id, date: s.date, time: s.time, note: s.note, done: s.done,
  }));
  DATA.payments = payments.map((p) => ({
    id: p.id, clientId: p.client_id, amount: p.amount, date: p.date, note: p.note,
  }));
  DATA.recipes = recipes.map((r) => ({
    id: r.id, name: r.name, kcal: r.kcal, protein: r.protein,
    ingredients: (r.ingredients || "").split("\n").map((s) => s.trim()).filter(Boolean),
  }));

  // Asignaciones de recetas por cliente (se cargan aparte, una por cliente,
  // porque son pocas filas y simplifica el esquema de datos en memoria).
  for (const c of DATA.clients) {
    const assigned = await dbGetClientRecipes(c.id);
    c.recipeIds = assigned.map((r) => r.id);
  }
}

// Ya no se usa saveData() como antes (no hay un solo "blob" que guardar).
// Se deja como no-op para no romper las pocas llamadas que quedan sueltas
// (ej. el respaldo periódico en init()) — cada acción concreta ahora
// guarda su propio cambio directamente vía las funciones db* de data.js.
function saveData() {}

/* ===== Helpers de fecha ===== */
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function fmtDateLong(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}
function fmtMoney(n) {
  n = Number(n) || 0;
  return "$" + n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
}
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "pm" : "am";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m}${ampm}`;
}

/* ===== Toast ===== */
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ===== Navegación entre pantallas ===== */
let currentTab = "hoy";
let currentClientId = null;

function goTo(tab) {
  currentTab = tab;
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll("nav.tabbar button").forEach((b) => b.classList.remove("active"));
  const screenMap = {
    hoy: "screen-hoy",
    clientes: "screen-clientes",
    cobros: "screen-cobros",
    nutricion: "screen-nutricion",
    "cliente-detalle": "screen-cliente-detalle",
  };
  document.getElementById(screenMap[tab]).classList.add("active");
  const navBtn = document.querySelector(`nav.tabbar button[data-tab="${tab}"]`);
  if (navBtn) navBtn.classList.add("active");

  document.getElementById("fabBtn").style.display = tab === "cliente-detalle" ? "none" : "flex";

  if (tab === "hoy") renderHoy();
  if (tab === "clientes") renderClients();
  if (tab === "cobros") renderCobros();
  if (tab === "nutricion") renderNutricion();
}

function handleFab() {
  if (currentTab === "hoy") openSessionSheet();
  else if (currentTab === "clientes") openClientSheet();
  else if (currentTab === "cobros") openPaymentSheet();
  else if (currentTab === "nutricion") openRecipeSheet();
}

/* ===== Sheets (modales) ===== */
function openSheet(id) {
  document.getElementById(id).classList.add("active");
}
function closeSheet(id) {
  document.getElementById(id).classList.remove("active");
}
function closeSheetOnBackdrop(e, id) {
  if (e.target.id === id) closeSheet(id);
}

function populateClientSelect(selectEl, placeholder) {
  selectEl.innerHTML = "";
  if (DATA.clients.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "Agrega un cliente primero";
    opt.value = "";
    selectEl.appendChild(opt);
    return false;
  }
  DATA.clients.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    selectEl.appendChild(opt);
  });
  return true;
}

/* ===== SESIONES ===== */
function openSessionSheet(prefillClientId) {
  const sel = document.getElementById("sessClient");
  const ok = populateClientSelect(sel, "Cliente");
  if (!ok) {
    showToast("Primero agrega un cliente.");
    return;
  }
  if (prefillClientId) sel.value = prefillClientId;
  document.getElementById("sessDate").value = todayISO();
  document.getElementById("sessTime").value = "09:00";
  document.getElementById("sessNote").value = "";
  openSheet("sheetSession");
}

async function saveSession() {
  const clientId = document.getElementById("sessClient").value;
  const date = document.getElementById("sessDate").value;
  const time = document.getElementById("sessTime").value;
  const note = document.getElementById("sessNote").value.trim();
  if (!clientId || !date || !time) {
    showToast("Completa cliente, fecha y hora.");
    return;
  }
  const created = await dbCreateSession({ client_id: clientId, date, time, note, done: false });
  if (!created) {
    showToast("No se pudo guardar. Revisa tu conexión.");
    return;
  }
  DATA.sessions.push({ id: created.id, clientId, date, time, note, done: false });
  closeSheet("sheetSession");
  showToast("Sesión agendada.");
  if (currentTab === "hoy") renderHoy();
  if (currentTab === "cliente-detalle") renderClienteDetalle(currentClientId);
}

async function toggleSessionDone(sessionId) {
  const s = DATA.sessions.find((x) => x.id === sessionId);
  if (!s) return;
  s.done = !s.done;
  renderHoy(); // respuesta visual inmediata, sin esperar la red
  await dbToggleSessionDone(sessionId, s.done);
}

async function deleteSession(sessionId) {
  DATA.sessions = DATA.sessions.filter((s) => s.id !== sessionId);
  renderHoy();
  if (currentTab === "cliente-detalle") renderClienteDetalle(currentClientId);
  const { error } = await supabaseClient.from("sessions").delete().eq("id", sessionId);
  if (error) console.error(error);
}

/* ===== CLIENTES ===== */
function openClientSheet() {
  document.getElementById("cName").value = "";
  document.getElementById("cPhone").value = "";
  document.getElementById("cFee").value = "";
  document.getElementById("cPlan").value = "sesion";
  document.getElementById("cGoal").value = "";
  openSheet("sheetClient");
}

async function saveClient() {
  const name = document.getElementById("cName").value.trim();
  if (!name) {
    showToast("El nombre es obligatorio.");
    return;
  }
  const payload = {
    name,
    phone: document.getElementById("cPhone").value.trim(),
    fee: Number(document.getElementById("cFee").value) || 0,
    plan: document.getElementById("cPlan").value,
    goal: document.getElementById("cGoal").value.trim(),
  };
  const created = await dbCreateClient(payload);
  if (!created) {
    showToast("No se pudo guardar. Revisa tu conexión.");
    return;
  }
  DATA.clients.push({ id: created.id, ...payload, createdAt: created.created_at, recipeIds: [] });
  closeSheet("sheetClient");
  showToast(`${name} agregado.`);
  renderClients();
}

async function deleteClient(clientId) {
  if (!confirm("¿Eliminar este cliente y todo su historial? Esta acción no se puede deshacer.")) return;
  DATA.clients = DATA.clients.filter((c) => c.id !== clientId);
  DATA.sessions = DATA.sessions.filter((s) => s.clientId !== clientId);
  DATA.payments = DATA.payments.filter((p) => p.clientId !== clientId);
  goTo("clientes");
  showToast("Cliente eliminado.");
  await dbDeleteClient(clientId); // el borrado en cascada en Supabase limpia sesiones/pagos relacionados
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function clientBalanceStatus(clientId) {
  // Simple heuristic: behind if monthly plan and no payment in last 31 days,
  // or if per-session plan and there are completed sessions with no matching payment count.
  const client = DATA.clients.find((c) => c.id === clientId);
  if (!client) return "paid";
  const payments = DATA.payments.filter((p) => p.clientId === clientId);
  if (client.plan === "mensual") {
    if (payments.length === 0) return "due";
    const last = payments.reduce((a, b) => (a.date > b.date ? a : b));
    const days = (new Date(todayISO()) - new Date(last.date)) / 86400000;
    return days > 31 ? "due" : "paid";
  } else {
    const doneSessions = DATA.sessions.filter((s) => s.clientId === clientId && s.done).length;
    return payments.length < doneSessions ? "due" : "paid";
  }
}

function renderClients() {
  const query = (document.getElementById("clientSearch").value || "").toLowerCase();
  const list = DATA.clients
    .filter((c) => c.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));

  document.getElementById("clientsEmpty").style.display = DATA.clients.length === 0 ? "block" : "none";
  const card = document.getElementById("clientsCard");
  card.style.display = DATA.clients.length === 0 ? "none" : "block";
  card.innerHTML = "";

  list.forEach((c) => {
    const status = clientBalanceStatus(c.id);
    const row = document.createElement("div");
    row.className = "client-row";
    row.onclick = () => {
      currentClientId = c.id;
      goTo("cliente-detalle");
    };
    row.innerHTML = `
      <div class="avatar">${initials(c.name)}</div>
      <div class="info">
        <div class="name">${escapeHtml(c.name)}</div>
        <div class="meta">${c.plan === "mensual" ? "Plan mensual" : "Por sesión"} · ${fmtMoney(c.fee)}</div>
      </div>
      <div class="status ${status}">${status === "paid" ? "Al día" : "Debe"}</div>
    `;
    card.appendChild(row);
  });

  if (list.length === 0 && DATA.clients.length > 0) {
    card.innerHTML = `<div class="empty"><p>Sin resultados para "${escapeHtml(query)}".</p></div>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderClienteDetalle(clientId) {
  const client = DATA.clients.find((c) => c.id === clientId);
  const body = document.getElementById("clienteDetalleBody");
  if (!client) {
    body.innerHTML = `<div class="empty"><p>Cliente no encontrado.</p></div>`;
    return;
  }
  const sessions = DATA.sessions
    .filter((s) => s.clientId === clientId)
    .sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
  const payments = DATA.payments
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const status = clientBalanceStatus(clientId);
  const assignedRecipes = DATA.recipes.filter((r) => (client.recipeIds || []).includes(r.id));

  body.innerHTML = `
    <div class="card raised" style="display:flex; align-items:center; gap:14px;">
      <div class="avatar" style="width:52px;height:52px;font-size:17px;">${initials(client.name)}</div>
      <div style="flex:1; min-width:0;">
        <h2 style="font-size:18px;">${escapeHtml(client.name)}</h2>
        <div style="color:var(--paper-dim); font-size:13px;">${client.phone ? escapeHtml(client.phone) + " · " : ""}${client.plan === "mensual" ? "Plan mensual" : "Por sesión"} · ${fmtMoney(client.fee)}</div>
        ${client.goal ? `<div style="color:var(--paper-dim); font-size:12.5px; margin-top:3px;">🎯 ${escapeHtml(client.goal)}</div>` : ""}
      </div>
      <div class="status ${status}">${status === "paid" ? "Al día" : "Debe"}</div>
    </div>

    <div style="display:flex; gap:10px; margin-bottom:8px;">
      <button class="btn ghost sm" style="flex:1;" onclick="openSessionSheet('${client.id}')">+ Sesión</button>
      <button class="btn ghost sm" style="flex:1;" onclick="openPaymentSheet('${client.id}')">+ Pago</button>
      <button class="btn ghost sm" style="flex:1;" onclick="openAssignSheet('${client.id}')">+ Nutrición</button>
    </div>

    <div class="section-label">Plan de nutrición asignado</div>
    <div class="card">
      ${
        assignedRecipes.length === 0
          ? `<div class="empty" style="padding:18px;"><p>Sin plantillas asignadas.</p></div>`
          : assignedRecipes.map((r) => recipeCardHtml(r, client.id)).join("")
      }
    </div>

    <div class="section-label">Próximas sesiones</div>
    <div class="card">
      ${
        sessions.filter((s) => s.date >= todayISO()).length === 0
          ? `<div class="empty" style="padding:18px;"><p>Sin sesiones próximas.</p></div>`
          : sessions
              .filter((s) => s.date >= todayISO())
              .map(
                (s) => `
            <div class="session-row">
              <div class="time mono">${fmtTime(s.time)}</div>
              <div class="info">
                <div class="name">${fmtDateLong(s.date)}</div>
                ${s.note ? `<div class="meta">${escapeHtml(s.note)}</div>` : ""}
              </div>
              <button class="btn danger sm" onclick="deleteSession('${s.id}')">Quitar</button>
            </div>`
              )
              .join("")
      }
    </div>

    <div class="section-label">Historial de pagos</div>
    <div class="card">
      ${
        payments.length === 0
          ? `<div class="empty" style="padding:18px;"><p>Sin pagos registrados aún.</p></div>`
          : payments
              .map(
                (p) => `
            <div class="alert-row">
              <span class="badge copper"></span>
              <div class="text"><b class="mono">${fmtMoney(p.amount)}</b> — ${fmtDateLong(p.date)}
                ${p.note ? `<span class="meta">${escapeHtml(p.note)}</span>` : ""}
              </div>
            </div>`
              )
              .join("")
      }
    </div>

    <button class="btn danger" style="margin-top:6px;" onclick="deleteClient('${client.id}')">Eliminar cliente</button>
  `;
}

/* ===== COBROS ===== */
function openPaymentSheet(prefillClientId) {
  const sel = document.getElementById("payClient");
  const ok = populateClientSelect(sel, "Cliente");
  if (!ok) {
    showToast("Primero agrega un cliente.");
    return;
  }
  if (prefillClientId) sel.value = prefillClientId;
  document.getElementById("payAmount").value = "";
  document.getElementById("payDate").value = todayISO();
  document.getElementById("payNote").value = "";
  // Autofill amount with the client's fee for convenience
  sel.onchange = () => {
    const c = DATA.clients.find((x) => x.id === sel.value);
    if (c) document.getElementById("payAmount").value = c.fee || "";
  };
  if (sel.value) sel.onchange();
  openSheet("sheetPayment");
}

async function savePayment() {
  const clientId = document.getElementById("payClient").value;
  const amount = Number(document.getElementById("payAmount").value);
  const date = document.getElementById("payDate").value;
  const note = document.getElementById("payNote").value.trim();
  if (!clientId || !amount || !date) {
    showToast("Completa cliente, monto y fecha.");
    return;
  }
  const created = await dbCreatePayment({ client_id: clientId, amount, date, note });
  if (!created) {
    showToast("No se pudo guardar. Revisa tu conexión.");
    return;
  }
  DATA.payments.push({ id: created.id, clientId, amount, date, note });
  closeSheet("sheetPayment");
  showToast("Pago registrado.");
  if (currentTab === "cobros") renderCobros();
  if (currentTab === "cliente-detalle") renderClienteDetalle(currentClientId);
}

function renderCobros() {
  const now = new Date();
  const monthStr = now.toISOString().slice(0, 7);
  const thisMonthPayments = DATA.payments.filter((p) => p.date.startsWith(monthStr));
  const total = thisMonthPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const expected = DATA.clients.reduce((sum, c) => sum + (Number(c.fee) || 0), 0);
  document.getElementById("monthTotal").textContent = fmtMoney(total);
  document.getElementById("monthSub").textContent =
    expected > 0 ? `cobrado de ${fmtMoney(expected)} esperado este mes` : "cobrado este mes";

  // Pendientes
  const due = DATA.clients.filter((c) => clientBalanceStatus(c.id) === "due");
  document.getElementById("dueEmpty").style.display = due.length === 0 ? "block" : "none";
  const dueList = document.getElementById("duePaymentsList");
  dueList.innerHTML = due
    .map(
      (c) => `
    <div class="alert-row">
      <span class="badge rust"></span>
      <div class="text"><b>${escapeHtml(c.name)}</b> — ${fmtMoney(c.fee)} pendiente
        <span class="meta">${c.plan === "mensual" ? "Plan mensual vencido" : "Sesión sin cobrar"}</span>
      </div>
    </div>`
    )
    .join("");

  // Historial
  const history = [...DATA.payments].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
  document.getElementById("historyEmpty").style.display = history.length === 0 ? "block" : "none";
  document.getElementById("paymentHistoryList").innerHTML = history
    .map((p) => {
      const c = DATA.clients.find((x) => x.id === p.clientId);
      return `
      <div class="alert-row">
        <span class="badge copper"></span>
        <div class="text"><b class="mono">${fmtMoney(p.amount)}</b> — ${escapeHtml(c ? c.name : "Cliente eliminado")}
          <span class="meta">${fmtDateLong(p.date)}${p.note ? " · " + escapeHtml(p.note) : ""}</span>
        </div>
      </div>`;
    })
    .join("");
}

/* ===== NUTRICIÓN ===== */
function openRecipeSheet() {
  document.getElementById("rName").value = "";
  document.getElementById("rKcal").value = "";
  document.getElementById("rProtein").value = "";
  document.getElementById("rIngredients").value = "";
  openSheet("sheetRecipe");
}

async function saveRecipe() {
  const name = document.getElementById("rName").value.trim();
  if (!name) {
    showToast("Ponle un nombre a la plantilla.");
    return;
  }
  const ingredients = document
    .getElementById("rIngredients")
    .value.split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const created = await dbCreateRecipe({
    name,
    kcal: Number(document.getElementById("rKcal").value) || 0,
    protein: Number(document.getElementById("rProtein").value) || 0,
    ingredients: ingredients.join("\n"),
  });
  if (!created) {
    showToast("No se pudo guardar. Revisa tu conexión.");
    return;
  }
  DATA.recipes.push({ id: created.id, name, kcal: created.kcal, protein: created.protein, ingredients });
  closeSheet("sheetRecipe");
  showToast("Plantilla guardada.");
  renderNutricion();
}

async function deleteRecipe(recipeId) {
  DATA.recipes = DATA.recipes.filter((r) => r.id !== recipeId);
  DATA.clients.forEach((c) => {
    c.recipeIds = (c.recipeIds || []).filter((id) => id !== recipeId);
  });
  renderNutricion();
  await dbDeleteRecipe(recipeId); // el borrado en cascada en Supabase limpia las asignaciones
}

function recipeCardHtml(r, clientIdForUnassign) {
  return `
    <div class="recipe-card">
      <div class="top">
        <span class="name">${escapeHtml(r.name)}</span>
        <span class="kcal mono">${r.kcal || "—"} kcal · ${r.protein || "—"}g prot</span>
      </div>
      ${r.ingredients.length ? `<div class="ingredients">${r.ingredients.map(escapeHtml).join(" · ")}</div>` : ""}
      ${
        clientIdForUnassign
          ? `<div class="swipe-del"><button class="btn ghost sm" onclick="unassignRecipe('${clientIdForUnassign}','${r.id}')">Quitar de este cliente</button></div>`
          : ""
      }
    </div>`;
}

function renderNutricion() {
  document.getElementById("recipesEmpty").style.display = DATA.recipes.length === 0 ? "block" : "none";
  document.getElementById("recipesList").innerHTML = DATA.recipes
    .map(
      (r) => `
      ${recipeCardHtml(r)}
      <div class="swipe-del" style="margin-top:-10px; margin-bottom:10px;">
        <button class="btn ghost sm" onclick="deleteRecipe('${r.id}')">Eliminar plantilla</button>
      </div>`
    )
    .join("");
}

let assignTargetClientId = null;
function openAssignSheet(clientId) {
  if (DATA.recipes.length === 0) {
    showToast("Primero crea una plantilla en la pestaña Nutrición.");
    return;
  }
  assignTargetClientId = clientId;
  const sel = document.getElementById("assignRecipe");
  sel.innerHTML = "";
  DATA.recipes.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.name;
    sel.appendChild(opt);
  });
  openSheet("sheetAssign");
}

async function confirmAssignRecipe() {
  const recipeId = document.getElementById("assignRecipe").value;
  const client = DATA.clients.find((c) => c.id === assignTargetClientId);
  if (!client || !recipeId) return;
  client.recipeIds = client.recipeIds || [];
  if (!client.recipeIds.includes(recipeId)) client.recipeIds.push(recipeId);
  closeSheet("sheetAssign");
  showToast("Plantilla asignada.");
  renderClienteDetalle(client.id);
  await dbAssignRecipe(client.id, recipeId);
}

async function unassignRecipe(clientId, recipeId) {
  const client = DATA.clients.find((c) => c.id === clientId);
  if (!client) return;
  client.recipeIds = (client.recipeIds || []).filter((id) => id !== recipeId);
  renderClienteDetalle(clientId);
  const { error } = await supabaseClient
    .from("client_recipes")
    .delete()
    .eq("client_id", clientId)
    .eq("recipe_id", recipeId);
  if (error) console.error(error);
}

/* ===== HOY (dashboard principal) ===== */
function renderHoy() {
  document.getElementById("todayDate").textContent = fmtDateLong(todayISO());

  const todaysSessions = DATA.sessions
    .filter((s) => s.date === todayISO())
    .sort((a, b) => (a.time > b.time ? 1 : -1));

  const pendingCount = todaysSessions.filter((s) => !s.done).length;
  document.getElementById("heroCount").innerHTML = `${todaysSessions.length}<span class="unit">sesiones hoy</span>`;
  document.getElementById("heroSub").textContent =
    todaysSessions.length === 0
      ? "Todo despejado por ahora."
      : pendingCount === 0
      ? "Completaste todas las sesiones de hoy. 💪"
      : `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"} de marcar como hecha.`;

  document.getElementById("todayEmpty").style.display = todaysSessions.length === 0 ? "block" : "none";
  document.getElementById("todaySessionsList").innerHTML = todaysSessions
    .map((s) => {
      const c = DATA.clients.find((x) => x.id === s.clientId);
      return `
      <div class="session-row">
        <div class="time mono">${fmtTime(s.time)}</div>
        <div class="info">
          <div class="name">${escapeHtml(c ? c.name : "Cliente eliminado")}</div>
          ${s.note ? `<div class="meta">${escapeHtml(s.note)}</div>` : ""}
        </div>
        <button class="check ${s.done ? "done" : ""}" onclick="toggleSessionDone('${s.id}')" aria-label="Marcar como hecha">
          <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>`;
    })
    .join("");

  // Alertas: clientes que deben dinero + sesiones de mañana sin confirmar (placeholder simple)
  const due = DATA.clients.filter((c) => clientBalanceStatus(c.id) === "due");
  const alertsBlock = document.getElementById("alertsBlock");
  if (due.length === 0) {
    alertsBlock.innerHTML = "";
  } else {
    alertsBlock.innerHTML = `
      <div class="section-label">Atención</div>
      <div class="card">
        ${due
          .slice(0, 5)
          .map(
            (c) => `
          <div class="alert-row">
            <span class="badge rust"></span>
            <div class="text"><b>${escapeHtml(c.name)}</b> tiene un pago pendiente
              <span class="meta">${fmtMoney(c.fee)} · ${c.plan === "mensual" ? "mensualidad vencida" : "sesión sin cobrar"}</span>
            </div>
          </div>`
          )
          .join("")}
      </div>`;
  }
}

/* ===== Instalación de la PWA (botón propio, en vez de depender
   de que la persona encuentre la opción en el menú del navegador) ===== */
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  // El navegador dispara esto cuando SÍ es posible instalar (manifest +
  // service worker válidos). Lo guardamos para usarlo cuando el usuario
  // toque nuestro botón, en vez de mostrar el prompt automático del navegador.
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById("installBtn");
  if (btn) btn.style.display = "flex";
});

async function handleInstallClick() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === "accepted") showToast("¡Instalada! Ya la tienes en tu pantalla de inicio.");
  deferredInstallPrompt = null;
  document.getElementById("installBtn").style.display = "none";
}

window.addEventListener("appinstalled", () => {
  const btn = document.getElementById("installBtn");
  if (btn) btn.style.display = "none";
  deferredInstallPrompt = null;
});

// Si ya se está ejecutando como app instalada (standalone), nunca mostrar
// el botón — no tiene sentido "instalar" lo que ya está instalado.
function isRunningInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

/* ===== Init ===== */
async function init() {
  // Register service worker for offline support + installability.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW falló:", e));
  }

  // Si ya corre instalada, jamás mostrar el botón de instalar.
  if (isRunningInstalled()) {
    const btn = document.getElementById("installBtn");
    if (btn) btn.style.display = "none";
  }

  // Si la persona llegó desde el link del correo de "recuperar contraseña",
  // Supabase deja una pista en la URL (hash con type=recovery). En ese caso
  // mostramos la pantalla de nueva contraseña en vez del flujo normal.
  if (window.location.hash.includes("type=recovery") || new URLSearchParams(window.location.search).get("type") === "recovery") {
    showResetPasswordScreen();
    return;
  }

  const session = await getSession();
  if (session) {
    await enterApp();
  } else {
    showAuthScreen();
  }

  // Si Supabase detecta que cambió la sesión (login/logout en otra pestaña,
  // token expirado, etc), reaccionamos en consecuencia.
  supabaseClient.auth.onAuthStateChange((_event, newSession) => {
    if (newSession && !CURRENT_USER) {
      CURRENT_USER = newSession.user;
      enterApp();
    } else if (!newSession) {
      showAuthScreen();
    }
  });
}

function showAuthScreen() {
  document.getElementById("authScreen").style.display = "flex";
  document.getElementById("forgotPasswordScreen").style.display = "none";
  document.getElementById("resetPasswordScreen").style.display = "none";
  document.getElementById("app").style.display = "none";
}

/* ===== Recuperar / restablecer contraseña ===== */

function showForgotPasswordScreen() {
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("forgotPasswordScreen").style.display = "flex";
  document.getElementById("forgotError").textContent = "";
  document.getElementById("forgotEmail").value = document.getElementById("authEmail").value || "";
}

async function handleForgotPassword() {
  const email = document.getElementById("forgotEmail").value.trim();
  const errEl = document.getElementById("forgotError");
  errEl.textContent = "";

  if (!email) {
    errEl.textContent = "Escribe tu correo.";
    return;
  }

  const btn = document.getElementById("forgotSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Enviando…";

  const result = await sendPasswordResetEmail(email);

  btn.disabled = false;
  btn.textContent = "Enviar link";

  if (!result.ok) {
    errEl.textContent = result.message;
    return;
  }

  showToast("Te enviamos un link a tu correo. Revisa tu bandeja (y spam).");
  showAuthScreen();
}

function showResetPasswordScreen() {
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("forgotPasswordScreen").style.display = "none";
  document.getElementById("app").style.display = "none";
  document.getElementById("resetPasswordScreen").style.display = "flex";
}

async function handleResetPassword() {
  const p1 = document.getElementById("resetPassword1").value;
  const p2 = document.getElementById("resetPassword2").value;
  const errEl = document.getElementById("resetError");
  errEl.textContent = "";

  if (!p1 || p1.length < 6) {
    errEl.textContent = "La contraseña debe tener al menos 6 caracteres.";
    return;
  }
  if (p1 !== p2) {
    errEl.textContent = "Las contraseñas no coinciden.";
    return;
  }

  const btn = document.getElementById("resetSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Guardando…";

  const result = await updatePassword(p1);

  btn.disabled = false;
  btn.textContent = "Guardar nueva contraseña";

  if (!result.ok) {
    errEl.textContent = result.message;
    return;
  }

  showToast("¡Contraseña actualizada! Ya puedes usar tu cuenta.");
  // Limpia el ?type=recovery de la URL para que no se quede pegado.
  window.history.replaceState({}, "", window.location.pathname);
  await enterApp();
}

async function enterApp() {
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("nicheScreen").style.display = "none";
  showToast("Cargando tus datos…");
  const profile = await fetchProfile();
  CURRENT_NICHE = profile?.niche || null;

  if (!CURRENT_NICHE) {
    showNicheScreen();
    return;
  }

  document.getElementById("app").style.display = "block";
  await syncFromSupabase();
  goTo("hoy");
  applyVocab(CURRENT_NICHE);
  if (typeof initBilling === "function") {
    try { await initBilling(); } catch (e) { console.warn("Billing module error:", e); }
  }
}

/* ===== Selección de nicho (solo la primera vez) ===== */
let CURRENT_NICHE = null;

function showNicheScreen() {
  document.getElementById("app").style.display = "none";
  document.getElementById("nicheScreen").style.display = "flex";
  const wrap = document.getElementById("nicheOptions");
  wrap.innerHTML = Object.entries(NICHES)
    .map(
      ([key, v]) => `
      <button class="niche-option" onclick="selectNiche('${key}')">
        <span class="icon">${v.icon}</span>
        <span>${v.label}</span>
      </button>`
    )
    .join("");
}

async function selectNiche(key) {
  CURRENT_NICHE = key;
  await dbSetNiche(key);
  document.getElementById("nicheScreen").style.display = "none";
  document.getElementById("app").style.display = "block";
  showToast("Cargando tus datos…");
  await syncFromSupabase();
  goTo("hoy");
  applyVocab(CURRENT_NICHE);
  if (typeof initBilling === "function") {
    try { await initBilling(); } catch (e) { console.warn("Billing module error:", e); }
  }
}

/* ===== Feedback ("ayúdanos a mejorar la app") ===== */
function openFeedbackSheet() {
  document.getElementById("feedbackMsg").value = "";
  openSheet("sheetFeedback");
}

async function submitFeedback() {
  const msg = document.getElementById("feedbackMsg").value.trim();
  if (!msg) {
    showToast("Escribe algo antes de enviar.");
    return;
  }
  const ok = await dbSendFeedback(msg, CURRENT_NICHE);
  closeSheet("sheetFeedback");
  showToast(ok ? "¡Gracias! Tu opinión nos ayuda a mejorar." : "No se pudo enviar. Intenta de nuevo.");
}

/* ===== Autenticación: UI ===== */
let authMode = "signin"; // "signin" | "signup"

function toggleAuthMode() {
  authMode = authMode === "signin" ? "signup" : "signin";
  document.getElementById("authBusinessNameField").style.display = authMode === "signup" ? "block" : "none";
  document.getElementById("authSubmitBtn").textContent = authMode === "signup" ? "Crear cuenta" : "Entrar";
  document.getElementById("authToggleBtn").textContent =
    authMode === "signup" ? "¿Ya tienes cuenta? Inicia sesión" : "¿No tienes cuenta? Regístrate";
  document.getElementById("authError").textContent = "";
}

async function handleAuthSubmit() {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const errEl = document.getElementById("authError");
  errEl.textContent = "";

  if (!email || !password) {
    errEl.textContent = "Completa correo y contraseña.";
    return;
  }

  const btn = document.getElementById("authSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Un momento…";

  const result = authMode === "signup"
    ? await signUp(email, password, document.getElementById("authBusinessName").value.trim())
    : await signIn(email, password);

  btn.disabled = false;
  btn.textContent = authMode === "signup" ? "Crear cuenta" : "Entrar";

  if (!result.ok) {
    errEl.textContent = result.message;
    return;
  }

  if (authMode === "signup") {
    showToast("¡Cuenta creada! Bienvenido a OneDesk.");
  }
  await enterApp();
}

async function handleLogout() {
  if (!confirm("¿Cerrar sesión?")) return;
  await signOut();
  DATA = defaultData();
  showAuthScreen();
}

document.addEventListener("DOMContentLoaded", init);
