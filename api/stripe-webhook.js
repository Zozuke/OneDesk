// =====================================================================
// OneDesk — Vercel Function: /api/stripe-webhook
// =====================================================================
// Stripe llama a esta función automáticamente cada vez que pasa algo
// importante (alguien pagó, canceló, falló un cobro, etc). Actualiza
// la tabla "profiles" en Supabase para reflejar ese cambio.
//
// IMPORTANTE: este endpoint necesita el "body crudo" sin procesar para
// poder verificar que la llamada de verdad viene de Stripe — por eso
// se desactiva el bodyParser automático de Vercel (ver `config` abajo).
//
// Después de desplegar, copia la URL de esta función:
//   https://tu-app.vercel.app/api/stripe-webhook
// y regístrala en Stripe Dashboard → Developers → Webhooks → Add endpoint.
// Eventos a escuchar: checkout.session.completed,
//   customer.subscription.updated, customer.subscription.deleted,
//   invoice.payment_failed
// =====================================================================

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { buffer } from "node:stream/consumers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-03-31.basil",
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Desactiva el parseo automático de JSON — Stripe necesita el body crudo.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Método no permitido");

  const signature = req.headers["stripe-signature"];
  const rawBody = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Firma de webhook inválida:", err);
    return res.status(400).send("Firma inválida");
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        if (userId) {
          const subscriptionId = session.subscription;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const periodEnd = getPeriodEnd(subscription);
          await supabase
            .from("profiles")
            .update({
              subscription_status: "active",
              stripe_subscription_id: subscriptionId,
              ...(periodEnd ? { current_period_end: periodEnd } : {}),
            })
            .eq("id", userId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const periodEnd = getPeriodEnd(subscription);
        await updateByCustomerId(subscription.customer, {
          subscription_status: mapStripeStatus(subscription.status),
          ...(periodEnd ? { current_period_end: periodEnd } : {}),
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await updateByCustomerId(subscription.customer, { subscription_status: "canceled" });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        await updateByCustomerId(invoice.customer, { subscription_status: "past_due" });
        break;
      }

      default:
        break; // otros eventos se ignoran a propósito
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Error procesando webhook:", err);
    return res.status(500).send("Error interno");
  }
}

async function updateByCustomerId(stripeCustomerId, fields) {
  await supabase.from("profiles").update(fields).eq("stripe_customer_id", stripeCustomerId);
}

// Stripe movió "current_period_end" de la suscripción al primer item de
// la suscripción (cambio de API a partir de 2025). Esto lee el valor de
// donde sea que esté disponible, sin importar la versión de tu cuenta.
function getPeriodEnd(subscription) {
  const fromItem = subscription.items?.data?.[0]?.current_period_end;
  const fromRoot = subscription.current_period_end;
  const seconds = fromItem ?? fromRoot;
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

function mapStripeStatus(status) {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "expired";
  }
}
