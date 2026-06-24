# SCF · Finanzas — Fase A (Supabase + Vite + Vercel)

Tu tracker financiero, ahora online: login con Google, data en Postgres, acceso desde cualquier dispositivo, sincronización en tiempo real entre ellos.

---

## Qué necesitas crear (una sola vez, ~15 min)

1. **GitHub** → github.com (si no tienes cuenta)
2. **Supabase** → supabase.com → "Start your project" → entra con GitHub
3. **Vercel** → vercel.com → "Sign up" → entra con GitHub

---

## Paso 1 · Supabase (la base de datos)

1. En supabase.com → **New project**. Nombre: `finanzas`. Región: `South America (São Paulo)`. Guarda la contraseña de la DB en un lugar seguro (no la vas a necesitar a diario).
2. Espera ~2 min a que el proyecto levante.
3. Ve a **SQL Editor** (ícono de terminal en el menú izquierdo) → **New query** → pega TODO el contenido de `supabase/schema.sql` → **Run**. Debe decir "Success".
4. Ve a **Authentication → Providers → Google** y actívalo:
   - Necesitas credenciales OAuth de Google: ve a [console.cloud.google.com](https://console.cloud.google.com) → crea un proyecto → **APIs & Services → Credentials → Create credentials → OAuth client ID** → tipo "Web application".
   - En "Authorized redirect URIs" pega la URL que Supabase te muestra en la pantalla del provider Google (algo como `https://xxxx.supabase.co/auth/v1/callback`).
   - Copia el **Client ID** y **Client Secret** de Google a Supabase → Save.
5. Ve a **Project Settings → API** y copia dos valores:
   - `Project URL` (ej: `https://xxxx.supabase.co`)
   - `anon public` key

## Paso 2 · El código a GitHub

> **Este paso se hace en la Terminal de tu computador** (en Mac: app "Terminal";
> en Windows: "PowerShell"). Necesitas tener **git** instalado: corre `git --version`
> para verificar; si no lo tienes, instálalo desde https://git-scm.com.

1. Crea un repositorio **vacío y privado** en github.com (botón verde "New", no marques
   ninguna casilla de README/licencia; debe quedar totalmente vacío).
2. En la Terminal, ubícate en la carpeta del proyecto y súbelo. Reemplaza `TU_USUARIO`
   por tu usuario de GitHub:

```bash
cd finanzas-app          # entra a la carpeta del proyecto descomprimido
git init                 # inicializa el repositorio local
git add -A               # marca todos los archivos
git commit -m "Fase A"   # crea el primer commit
git branch -M main       # nombra la rama principal "main"
git remote add origin https://github.com/TU_USUARIO/finanzas-app.git
git push -u origin main  # sube el código a GitHub
```

> Si en el `push` te pide usuario y contraseña: la "contraseña" de GitHub ya no es tu
> clave normal, es un **token**. Genéralo en github.com → Settings → Developer settings
> → Personal access tokens → Tokens (classic) → Generate new token, marca el scope `repo`,
> y pégalo cuando te lo pida.

> **¿No quieres usar la Terminal?** Alternativa sin comandos: instala
> [GitHub Desktop](https://desktop.github.com), arrastra la carpeta `finanzas-app`,
> y publica el repo desde la interfaz gráfica. Vercel (Paso 3) funciona igual.

## Paso 3 · Vercel (el deploy)

1. En vercel.com → **Add New → Project** → importa el repo `finanzas-app`.
2. Framework: detecta Vite solo. No cambies nada de build.
3. En **Environment Variables** agrega (los nombres deben ir **exactos**, respetan
   mayúsculas y el prefijo `VITE_`):
   - `VITE_SUPABASE_URL` = el Project URL del paso 1.5
   - `VITE_SUPABASE_ANON_KEY` = la anon key del paso 1.5
4. **Deploy**. Te da una URL tipo `finanzas-app-xxx.vercel.app`.
5. **⚠️ Paso crítico — no lo saltes.** Vuelve a Supabase → **Authentication → URL
   Configuration** y pega tu URL de Vercel **completa y sin barra final**:
   - **Site URL**: `https://finanzas-app-xxx.vercel.app`
   - **Redirect URLs**: agrega la misma URL
   - Cópiala y pégala desde la barra del navegador; no la escribas a mano. Un solo
     carácter de más (un espacio, una `/` al final, `http` en vez de `https`) deja la
     URL mal y rompe el login.

> **Si al entrar ves una pantalla en negro:** casi siempre es esto. El origen es uno de
> dos: (a) las URLs de Supabase del paso 5 están mal tipeadas, o (b) las variables de
> entorno del paso 3 tienen el nombre mal o quedaron vacías. Para diagnosticar: abre la
> consola del navegador (clic derecho → Inspeccionar → pestaña Console). Si ves un error
> de Supabase o de `redirect`, es las URLs. Cada vez que cambies una variable de entorno
> en Vercel, haz **Redeploy** (Deployments → ··· → Redeploy) para que tome el cambio.

## Paso 4 · Primera entrada

1. Abre tu URL de Vercel → **Entrar con Google**.
2. La app detecta que no tienes data → pantalla de **importación** → sube tu `finanzas-santiago.json`.
3. Listo. Verifica el criterio de cierre de la Fase A: abre la app en el celular, registra un pago de deuda, y míralo aparecer en el computador sin recargar.

---

## Dominio propio (opcional, cuando quieras)

- Compra el dominio (Namecheap/Cloudflare, ~USD $12/año).
- Landing en Framer → publica al dominio raíz (`tudominio.com`); botón "Entrar" → `app.tudominio.com`.
- En Vercel → Settings → Domains → agrega `app.tudominio.com` y sigue las instrucciones de DNS.
- Agrega la nueva URL en Supabase → Authentication → Redirect URLs.

## Desarrollo local

```bash
cp .env.example .env   # y llena las dos variables
npm install
npm run dev            # http://localhost:5173
```

## Estructura

```
src/
  logic/      ← funciones puras de M1, portadas tal cual (fases, acciones, cascada)
  storage/    ← capa Supabase: mapea el shape del STATE ⇄ Postgres
  state/      ← StoreContext: auth + estado + mutaciones optimistas
  components/ ← Layout (nav/topbar/FAB), modales, hook de Chart.js
  views/      ← Dashboard, Movimientos, Pendientes, Presupuesto, Insights, Cuentas
  onboarding/ ← Login + importador del JSON (idempotente)
supabase/
  schema.sql  ← pegar en SQL Editor: 10 tablas con RLS
```

## Qué sigue (según PRD v2)

- **Fase B**: subir extractos PDF desde la app (parsing client-side; la clave nunca viaja).
- **Fase C**: robot de facturas (Gmail + cron + avisos vía Resend).
- **Fase D**: onboarding genérico, landing, Stripe.
