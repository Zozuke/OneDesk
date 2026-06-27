/* =====================================================================
   OneDesk — Módulo de suscripción (billing.js) — versión conectada
   -----------------------------------------------------------------
   El estado de "trial / activo / vencido" vive en la tabla `profiles`
   de Supabase (columna subscription_status), actualizada automáticamente
   por el webhook de Stripe — que corre como función de Vercel en
   /api/stripe-webhook, no en Supabase. Este archivo ya NO decide el
   estado — solo lo LEE y muestra la interfaz correspondiente.

   El botón "Activar plan" llama a /api/stripe-checkout (función de
   Vercel, vive en el mismo dominio que esta app), que crea una sesión
   de pago real y redirige al usuario a Stripe.
   ===================================================================== */

const BILLING_CONFIG = {
  monthlyPrice: 19,
  currencySymbol: "$",
};

let CURRENT_PROFILE = null;

async function initBilling() {
  CURRENT_PROFILE = await fetchProfile();
  renderBillingUI();
}

function trialDaysLeft() {
  if (!CURRENT_PROFILE?.trial_ends_at) return 0;
  const end = new Date(CURRENT_PROFILE.trial_ends_at);
  const now = new Date();
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
}

function getBillingStatus() {
  if (!CURRENT_PROFILE) return "trial";
  if (CURRENT_PROFILE.subscription_status === "active") return "active";
  if (CURRENT_PROFILE.subscription_status === "past_due") return "past_due";
  if (CURRENT_PROFILE.subscription_status === "canceled") return "expired";
  return trialDaysLeft() > 0 ? "trial" : "expired";
}

function renderBillingUI() {
  const status = getBillingStatus();
  let bar = document.getElementById("billingBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "billingBar";
    document.body.appendChild(bar);
  }

  if (status === "trial") {
    const left = trialDaysLeft();
    bar.style.display = "flex";
    bar.className = "billing-bar trial";
    bar.innerHTML = `
      <span>${left} día${left === 1 ? "" : "s"} gratis restante${left === 1 ? "" : "s"}</span>
      <button class="billing-bar-cta" onclick="openBillingSheet()">Ver plan</button>
    `;
  } else if (status === "expired" || status === "past_due") {
    bar.style.display = "flex";
    bar.className = "billing-bar expired";
    bar.innerHTML = `
      <span>${status === "past_due" ? "Hubo un problema con tu cobro" : "Tu periodo de prueba terminó"}</span>
      <button class="billing-bar-cta" onclick="openBillingSheet()">Activar plan</button>
    `;
  } else {
    bar.style.display = "none";
  }
}

function openBillingSheet() {
  let sheet = document.getElementById("sheetBilling");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "sheetBilling";
    sheet.className = "sheet-backdrop";
    sheet.onclick = (e) => {
      if (e.target === sheet) sheet.classList.remove("active");
    };
    document.body.appendChild(sheet);
  }
  const status = getBillingStatus();
  sheet.innerHTML = `
    <div class="sheet">
      <div class="handle"></div>
      <h2>${status === "active" ? "Tu plan" : "Activar OneDesk"}</h2>
      ${
        status === "active"
          ? `<p style="color:var(--paper-dim); font-size:14px; line-height:1.5;">Tu acceso está activo. Gracias por usar OneDesk.</p>
             <button class="btn ghost sm" style="margin-bottom:14px;" onclick="openCustomerPortal()">Gestionar suscripción / cancelar</button>`
          : `<p style="color:var(--paper-dim); font-size:14px; line-height:1.5;">
              ${status === "trial" ? `Te quedan ${trialDaysLeft()} días gratis. ` : ""}
              ${status === "past_due" ? "Hubo un problema al cobrar tu última mensualidad. " : ""}
              OneDesk cuesta <b class="mono" style="color:var(--paper);">${BILLING_CONFIG.currencySymbol}${BILLING_CONFIG.monthlyPrice}/mes</b>.
              Los códigos de promoción se aplican en la siguiente pantalla, dentro del checkout de Stripe.
            </p>`
      }
      <div class="sheet-actions">
        <button class="btn ghost" onclick="document.getElementById('sheetBilling').classList.remove('active')">
          ${status === "active" ? "Cerrar" : "Más tarde"}
        </button>
        ${
          status !== "active"
            ? `<button class="btn" id="checkoutBtn" onclick="handleGoToCheckout()">Activar — ${BILLING_CONFIG.currencySymbol}${BILLING_CONFIG.monthlyPrice}/mes</button>`
            : ""
        }
      </div>
    </div>
  `;
  sheet.classList.add("active");
}

// Llama a la Edge Function stripe-checkout y redirige al usuario a Stripe.
async function handleGoToCheckout() {
  const btn = document.getElementById("checkoutBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Abriendo pago…"; }

  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData.session.access_token;

    const res = await fetch(`/api/stripe-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({}),
    });
    const body = await res.json();
    if (body.url) {
      window.location.href = body.url; // redirige a la pantalla de pago de Stripe
    } else {
      showToast(body.error || "No se pudo iniciar el pago.");
      if (btn) { btn.disabled = false; btn.textContent = `Activar — ${BILLING_CONFIG.currencySymbol}${BILLING_CONFIG.monthlyPrice}/mes`; }
    }
  } catch (e) {
    console.error(e);
    showToast("No se pudo conectar con el servidor de pagos.");
    if (btn) { btn.disabled = false; btn.textContent = `Activar — ${BILLING_CONFIG.currencySymbol}${BILLING_CONFIG.monthlyPrice}/mes`; }
  }
}

// Llama a la Edge Function stripe-portal para que el usuario gestione/cancele.
async function openCustomerPortal() {
  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData.session.access_token;
    const res = await fetch(`/api/stripe-portal`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json();
    if (body.url) window.location.href = body.url;
    else showToast(body.error || "No se pudo abrir el portal.");
  } catch (e) {
    console.error(e);
    showToast("No se pudo conectar con el servidor de pagos.");
  }
}

// Si el usuario vuelve de pagar en Stripe (success_url incluye ?pago=exitoso),
// refrescamos su perfil para reflejar el nuevo estado sin que tenga que
// cerrar y volver a abrir la app.
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("pago") === "exitoso") {
    showToast("¡Pago confirmado! Activando tu plan…");
    setTimeout(async () => {
      CURRENT_PROFILE = await fetchProfile();
      renderBillingUI();
    }, 1500);
  }
});
