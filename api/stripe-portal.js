// =====================================================================
// OneDesk — Vercel Function: /api/stripe-portal
// =====================================================================
// Genera un link al "Portal de cliente" de Stripe, donde el usuario
// puede ver su factura, cambiar tarjeta o cancelar.
// Mismas variables de entorno que stripe-checkout.js (ver ese archivo).
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userData.user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return res.status(400).json({ error: "Aún no tienes una suscripción activa." });
    }

    const siteUrl = process.env.SITE_URL || "https://tu-app.example.com";
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${siteUrl}/`,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error("stripe-portal error:", err);
    return res.status(500).json({ error: "No se pudo abrir el portal." });
  }
}
