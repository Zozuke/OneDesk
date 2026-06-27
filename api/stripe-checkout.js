// =====================================================================
// OneDesk — Vercel Function: /api/stripe-checkout
// =====================================================================
// Qué hace: cuando el usuario aprieta "Activar plan" en la app, esta
// función crea una "sesión de pago" de Stripe y le regresa a la app
// el link al que debe mandar al usuario para que pague.
//
// Cómo se despliega: NO necesita comandos especiales. Al subir esta
// carpeta a GitHub y conectarla a Vercel, este archivo se convierte
// automáticamente en el endpoint /api/stripe-checkout — Vercel lo
// detecta solo por estar dentro de /api.
//
// Variables de entorno necesarias (Vercel → Settings → Environment
// Variables — sin terminal):
//   STRIPE_SECRET_KEY        → tu clave secreta de Stripe (sk_test_... o sk_live_...)
//   STRIPE_PRICE_ID_MONTHLY  → el ID del precio mensual que creaste en Stripe
//   SITE_URL                 → la URL pública de tu app (para redirigir tras pagar)
//   SUPABASE_URL             → la misma URL que ya usas en pwa/data.js
//   SUPABASE_SERVICE_ROLE_KEY→ clave de servicio de Supabase (Settings → API,
//                              "service_role" — esta SÍ es secreta, solo va aquí,
//                              nunca en el código del navegador)
// =====================================================================

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-03-31.basil",
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // CORS: permite que la PWA (corriendo en el navegador) llame a esta función
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Falta autenticación." });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ error: "Sesión inválida." });
    }

    const user = userData.user;
    const promoCode = req.body?.promoCode || null;

    // Buscamos (o creamos) el customer de Stripe asociado a este usuario.
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    let discounts;
    if (promoCode) {
      const codes = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
      if (codes.data.length > 0) discounts = [{ promotion_code: codes.data[0].id }];
    }

    const siteUrl = process.env.SITE_URL || "https://tu-app.example.com";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID_MONTHLY, quantity: 1 }],
      discounts,
      allow_promotion_codes: discounts ? undefined : true,
      success_url: `${siteUrl}/?pago=exitoso`,
      cancel_url: `${siteUrl}/?pago=cancelado`,
      metadata: { supabase_user_id: user.id },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("stripe-checkout error:", err);
    return res.status(500).json({ error: "No se pudo iniciar el pago. Intenta de nuevo." });
  }
}
