# OneDesk — Guía de despliegue (sin terminal)

Esta guía conecta todo: login real, base de datos en la nube, y cobro real con
Stripe — **todo desde el navegador, sin usar terminal**, pensado para hacerse
incluso desde el celular.

Sigue los pasos en orden — cada uno depende del anterior.

---

## Cómo está organizado el proyecto

```
tu-repo/  (raíz de tu repositorio en GitHub)
├── index.html, app.js, billing.js, data.js, vocab.js, sw.js, manifest.json, icons
│     ← tu app (PWA). Esto es lo que Vercel publica como tu sitio.
├── api/
│   ├── stripe-checkout.js   ← función que crea el cobro
│   ├── stripe-portal.js     ← función para que el usuario gestione su pago
│   └── stripe-webhook.js    ← función que escucha avisos de Stripe
│     ← Vercel detecta esta carpeta solo y la convierte en backend,
│       sin que tengas que configurar nada extra.
├── package.json   ← le dice a Vercel qué paquetes instalar para que
│                     las funciones de arriba funcionen
└── supabase/
    └── schema.sql  ← NO se sube a GitHub. Se pega directo en el panel
                        de Supabase, una sola vez (Parte 2 de esta guía).
```

---

## Parte 1 — Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) → crea una cuenta (si no tienes) → **New Project**.
2. Ponle un nombre (ej. `onedesk`) y una contraseña de base de datos (guárdala en un lugar seguro).
3. Espera 1-2 minutos a que el proyecto termine de crearse.
4. Ve a **Project Settings → API**. Ahí vas a copiar 3 valores distintos, en distintos momentos de esta guía:
   - **Project URL** (algo como `https://abcxyz.supabase.co`)
   - **anon public key** (clave larga — esta NO es secreta, va directo en tu código)
   - **service_role key** (otra clave larga — esta SÍ es secreta, solo va en Vercel, nunca en tu código)

---

## Parte 2 — Crear las tablas de la base de datos

1. En el menú lateral de Supabase, abre **SQL Editor** → **New query**.
2. Abre el archivo `supabase/schema.sql` (incluido en este proyecto), copia **todo** su contenido, y pégalo en el editor.
3. Clic en **Run**. Deberías ver "Success" — esto crea todas las tablas, la seguridad y las automatizaciones de un solo golpe.

---

## Parte 3 — Conectar tu app a Supabase

1. Abre el archivo `data.js` (en la raíz de tu repo).
2. Busca estas dos líneas, cerca del inicio:
   ```js
   const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
   const SUPABASE_ANON_KEY = "TU-ANON-KEY-AQUI";
   ```
3. Reemplázalas con la **Project URL** y la **anon public key** que copiaste en la Parte 1.
4. Guarda y sube el cambio a GitHub (puedes editar el archivo directo en la web de GitHub, sin terminal).

En este punto, si tu repo ya está conectado a Vercel, **ya puedes registrarte, iniciar sesión, y usar los 4 módulos con datos reales en la nube.** Lo único que falta es el cobro real — eso es la Parte 4 en adelante.

---

## Parte 4 — Crear el producto y precio en Stripe

1. Entra a tu cuenta de [Stripe Dashboard](https://dashboard.stripe.com).
2. Activa el **modo de prueba** (interruptor arriba a la derecha) mientras pruebas todo.
3. Ve a **Product catalog → Add product**.
   - Nombre: `OneDesk Plan Mensual`
   - Precio: el que decidas, recurrente, cada mes.
4. Guarda el producto. Copia el **Price ID** (empieza con `price_...`).

### Promociones (opcional, para más adelante)
**Product catalog → Coupons → New** para crear un % de descuento, y luego en
**Promotion codes** creas el código que tus usuarios van a escribir (ej. `LANZAMIENTO50`).
Todo desde el navegador de Stripe, sin tocar código.

---

## Parte 5 — Conectar tu repo de GitHub a Vercel

1. Entra a [vercel.com](https://vercel.com) → **Add New → Project**.
2. Elige tu repositorio de GitHub.
3. Framework Preset: déjalo en **Other** (tu proyecto no usa ningún framework — es HTML simple + funciones en `/api`, Vercel los detecta solo).
4. No cambies nada más todavía — antes de darle "Deploy", sigue a la Parte 6 para agregar las variables de entorno (si ya le diste deploy, no pasa nada, las agregas después y vuelves a desplegar).

---

## Parte 6 — Configurar las claves en Vercel (sin terminal)

Dentro de tu proyecto en Vercel: **Settings → Environment Variables**. Agrega una por una:

| Nombre de la variable | Valor | ¿Dónde la consigo? |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` | Stripe → Developers → API keys |
| `STRIPE_PRICE_ID_MONTHLY` | `price_...` | El que copiaste en la Parte 4 |
| `SITE_URL` | `https://tu-app.vercel.app` | La URL que Vercel te da a tu proyecto |
| `SUPABASE_URL` | `https://abcxyz.supabase.co` | La misma de la Parte 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | clave larga | Supabase → Settings → API → **service_role** (¡no la anon key!) |

Después de agregar las 5, ve a **Deployments → (los tres puntos del último deploy) → Redeploy**, para que Vercel las tome en cuenta.

---

## Parte 7 — Conectar el webhook de Stripe

1. Tu función de webhook ya está viva en: `https://tu-app.vercel.app/api/stripe-webhook` (usa tu URL real de Vercel).
2. En Stripe: **Developers → Webhooks → Add endpoint**.
3. Pega esa URL.
4. En "Events to send", selecciona:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Guarda. Stripe te muestra un **Signing secret** (empieza con `whsec_...`). Cópialo.
6. Regresa a Vercel → Settings → Environment Variables → agrega una variable más:
   - `STRIPE_WEBHOOK_SECRET` = ese valor que copiaste.
7. Vuelve a hacer **Redeploy** (igual que en la Parte 6) para que tome esta nueva variable.

---

## Parte 8 — Probar que todo funciona (en modo de prueba)

1. Abre tu app publicada, regístrate con un correo de prueba.
2. Da clic en "Ver plan" → "Activar".
3. Te lleva a una pantalla de pago de Stripe. Usa esta tarjeta de prueba:
   - Número: `4242 4242 4242 4242`
   - Fecha: cualquier fecha futura
   - CVC: cualquier 3 números
4. Si todo salió bien, vuelves a la app y el aviso de "días gratis" desaparece — ya estás "activo".
5. Confírmalo en **Supabase → Table Editor → profiles**: la columna `subscription_status` debe decir `active`.

---

## Parte 9 — Pasar a producción (cobrar de verdad)

Cuando ya probaste todo y quieras cobrar con dinero real:

1. En Stripe, apaga el modo de prueba.
2. Repite la Parte 4 (crear producto/precio) y la Parte 7 (webhook) **en modo real** — son valores distintos a los de prueba.
3. En Vercel → Settings → Environment Variables, edita (no agregues nuevas, edita las que ya tienes) los valores de:
   - `STRIPE_SECRET_KEY` → ahora empieza con `sk_live_...`
   - `STRIPE_PRICE_ID_MONTHLY` → el nuevo price_id de modo real
   - `STRIPE_WEBHOOK_SECRET` → el nuevo whsec_ de modo real
4. Guarda → Redeploy. Todo esto, otra vez, sin terminal — solo editar y guardar en el mismo panel.

---

## Cómo ver tus usuarios reales

Ve a **Supabase → Table Editor → profiles**. Ahí ves cada negocio registrado, cuándo se
registró, su estado de pago, y qué tipo de negocio eligió (columna `niche`).

Revisa también **Supabase → Table Editor → feedback** para ver las opiniones que la
gente deja desde el botón "Ayúdanos a mejorar" dentro de la app.

---

## Si algo no funciona

- **El login no funciona / error de conexión:** revisa que `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `data.js` estén bien copiadas, sin espacios extra.
- **El botón de pago no hace nada o da error:** revisa que las 5 variables de la Parte 6 estén bien puestas en Vercel, y que hayas dado Redeploy después de agregarlas.
- **El estado de pago no se actualiza después de pagar:** revisa que el webhook (Parte 7) esté registrado con la URL correcta y que `STRIPE_WEBHOOK_SECRET` esté en Vercel.
- Vercel → tu proyecto → **Deployments → (el deploy activo) → Functions** te deja ver los logs de error de `api/stripe-checkout`, `api/stripe-portal` y `api/stripe-webhook` si algo falla — útil para diagnosticar sin terminal.
