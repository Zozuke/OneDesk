# OneDesk — Guía de despliegue (Supabase + Stripe)

Esta guía conecta todo lo que se construyó: login real, base de datos en la nube,
y cobro real con Stripe. Sigue los pasos **en orden** — cada uno depende del anterior.

No necesitas saber programar para seguir esto. Es copiar, pegar y dar clic.

---

## Parte 1 — Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) → crea una cuenta (si no tienes) → **New Project**.
2. Ponle un nombre (ej. `onedesk`) y una contraseña de base de datos (guárdala en un lugar seguro).
3. Espera 1-2 minutos a que el proyecto termine de crearse.
4. Ve a **Project Settings → API**. Copia dos valores, los vas a necesitar varias veces:
   - **Project URL** (algo como `https://abcxyz.supabase.co`)
   - **anon public key** (una clave larga)

---

## Parte 2 — Crear las tablas de la base de datos

1. En el menú lateral de Supabase, abre **SQL Editor**.
2. Clic en **New query**.
3. Abre el archivo `supabase/schema.sql` (incluido en este proyecto), copia **todo** su contenido, y pégalo en el editor.
4. Clic en **Run**. Deberías ver "Success" — esto creó todas las tablas, la seguridad y las automatizaciones de un solo golpe.

---

## Parte 3 — Conectar el frontend (la app) a Supabase

1. Abre el archivo `pwa/data.js`.
2. Busca estas dos líneas, cerca del inicio:
   ```js
   const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
   const SUPABASE_ANON_KEY = "TU-ANON-KEY-AQUI";
   ```
3. Reemplázalas con los valores que copiaste en la Parte 1.
4. Guarda el archivo.

En este punto, si subes la carpeta `pwa/` a un hosting (Vercel, Netlify, GitHub Pages),
**ya puedes registrarte, iniciar sesión, y usar los 4 módulos con datos reales en la nube.**
Lo único que falta es conectar el cobro real — eso es la Parte 4 en adelante.

---

## Parte 4 — Crear el producto y precio en Stripe

1. Entra a tu cuenta de [Stripe Dashboard](https://dashboard.stripe.com).
2. Activa el **modo de prueba** (toggle arriba a la derecha) mientras pruebas todo. Cuando estés listo para cobrar de verdad, repites esto en modo real.
3. Ve a **Product catalog → Add product**.
   - Nombre: `OneDesk Plan Mensual`
   - Precio: el que decidas (ej. $19 USD), recurrente, cada mes.
4. Guarda el producto. Copia el **Price ID** (empieza con `price_...`) — lo necesitas en la Parte 6.

### Promociones (opcional, para más adelante)
Para crear un descuento futuro: **Product catalog → Coupons → New**, defines el % de descuento,
y luego en **Promotion codes** creas el código que tus clientes van a escribir (ej. `LANZAMIENTO50`).
No necesitas tocar código para esto — se gestiona todo desde Stripe.

---

## Parte 5 — Instalar las herramientas de línea de comandos

Necesitas instalar dos programas una sola vez en tu computadora:

1. **Supabase CLI**: sigue las instrucciones de instalación en [supabase.com/docs/guides/cli](https://supabase.com/docs/guides/cli) según tu sistema operativo (Windows, Mac o Linux).
2. Inicia sesión: abre una terminal y ejecuta:
   ```
   supabase login
   ```
   Esto abre tu navegador para confirmar.

---

## Parte 6 — Configurar las claves secretas (nunca van en el código)

En la terminal, dentro de la carpeta de este proyecto:

```bash
supabase link --project-ref TU-PROJECT-REF
```
(El "project-ref" es la parte de tu Project URL antes de `.supabase.co`, ej. `abcxyz`)

Luego configura los secretos (reemplaza cada valor con el tuyo real):

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx
supabase secrets set STRIPE_PRICE_ID_MONTHLY=price_xxxxxxxxxxxx
supabase secrets set SITE_URL=https://tu-app-publicada.com
```

La `STRIPE_SECRET_KEY` la encuentras en Stripe → **Developers → API keys** (la que dice "Secret key", no la "Publishable key").

---

## Parte 7 — Desplegar las Edge Functions

Estas son las 3 funciones que ya están escritas en `supabase/functions/`. Solo hay que subirlas:

```bash
supabase functions deploy stripe-checkout
supabase functions deploy stripe-portal
supabase functions deploy stripe-webhook --no-verify-jwt
```

---

## Parte 8 — Conectar el webhook de Stripe

1. Copia la URL de tu función `stripe-webhook` (Supabase te la muestra después de desplegarla; se ve algo como `https://abcxyz.supabase.co/functions/v1/stripe-webhook`).
2. En Stripe: **Developers → Webhooks → Add endpoint**.
3. Pega esa URL.
4. En "Events to send", busca y selecciona:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Guarda. Stripe te va a mostrar un **Signing secret** (empieza con `whsec_...`). Cópialo.
6. De vuelta en tu terminal:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
   ```

---

## Parte 9 — Probar que todo funciona (en modo de prueba)

1. Abre tu app publicada, regístrate con un correo de prueba.
2. Da clic en "Ver plan" → "Activar".
3. Te va a llevar a una pantalla de pago de Stripe. Usa esta tarjeta de prueba:
   - Número: `4242 4242 4242 4242`
   - Fecha: cualquier fecha futura
   - CVC: cualquier 3 números
4. Si todo salió bien, vuelves a la app y el aviso de "días gratis" desaparece — ya estás "activo".
5. Puedes confirmarlo también en **Supabase → Table Editor → profiles**: la columna `subscription_status` debe decir `active`.

---

## Parte 10 — Pasar a producción (cobrar de verdad)

Cuando ya probaste todo en modo de prueba y quieras cobrar con dinero real:

1. En Stripe, apaga el modo de prueba (toggle arriba a la derecha).
2. Repite la Parte 4 (crear producto/precio) y la Parte 8 (webhook) **en modo real** — son URLs y claves distintas a las de prueba.
3. Actualiza tus secretos con las claves reales (`sk_live_...` en vez de `sk_test_...`):
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxx
   supabase secrets set STRIPE_PRICE_ID_MONTHLY=price_xxxxxxxxxxxx
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
   ```
4. Vuelve a desplegar las funciones (Parte 7) para que tomen los nuevos secretos.

---

## Cómo ver tus usuarios reales (lo que antes era imposible)

Ve a **Supabase → Table Editor → profiles**. Ahí ves cada negocio registrado, cuándo se
registró, su estado de pago, y desde esta actualización también **qué tipo de negocio
eligió** (columna `niche`) — útil para saber qué nicho está usando más la app de verdad.

También revisa **Supabase → Table Editor → feedback**: ahí está cada opinión que la
gente escribió desde el botón de "Ayúdanos a mejorar" dentro de la app, junto con el
nicho de quien la escribió — esto te dice, con datos reales, si algún nicho necesita
algo más que un cambio de vocabulario.

Para algo más visual (gráficas de cuántos usuarios nuevos por día, etc.), Supabase tiene
reportes básicos en **Database → Reports**, o puedes conectar una herramienta externa
de analítica más adelante — eso ya sería un paso extra, no obligatorio para empezar.

---

## Sobre el selector de "tipo de negocio" (nicho)

Tras el primer inicio de sesión, cada usuario elige a qué se dedica (entrenador,
peluquero, taller, u otro). Esto **solo cambia palabras y textos de ejemplo** en la
interfaz — todos los nichos comparten exactamente la misma base de datos y estructura.

Esto fue una decisión deliberada: agregar campos distintos por nicho (por ejemplo,
placas de vehículo para talleres) sin que usuarios reales de ese nicho lo hayan pedido
sería construir a ciegas. El botón de feedback existe justo para reunir esa evidencia
antes de invertir en construir algo más profundo por nicho.

Si más adelante quieres agregar o ajustar un nicho, todo vive en `pwa/vocab.js` — es
un solo archivo, pensado para editarse sin tocar el resto de la app (mismo principio
de "piezas aisladas" que el sistema de plugins documentado en el README del proyecto).
