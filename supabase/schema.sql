-- ═══════════════════════════════════════════════════════════════
-- FINANZAS · Esquema Supabase (Fase A)
-- Pegar completo en: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

-- Perfil (1:1 con auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  phase_current int not null default 0,
  phase_since date not null default current_date,
  phase_override int,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  descripcion text not null,
  amount bigint not null,
  category text,
  account text,
  note text,
  orig_currency text,
  orig_amount numeric,
  fx_rate numeric,
  cat_source text,
  mission_tag text,
  income_type text,
  created_at timestamptz not null default now()
);
create index if not exists idx_tx_user_date on transactions(user_id, date desc);

create table if not exists pending_items (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  amount bigint not null,
  due_date date not null,
  category text,
  icon text,
  recur text not null default 'none',          -- none|monthly|bimonthly|yearly
  paid boolean not null default false,
  provider_key text,                            -- enlace al robot de facturas (Fase C)
  created_at timestamptz not null default now()
);
create index if not exists idx_pending_user_due on pending_items(user_id, due_date);

create table if not exists debts (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  acreedor text not null,
  saldo bigint not null,
  saldo_inicial bigint not null,
  tasa_ea numeric not null default 0,
  cuota_min bigint not null default 0,
  cuota_actual bigint not null default 0,
  orden_ataque int not null default 99,
  tipo text,                                    -- revolvente|cuota_fija|informal
  metodo_pago text,                             -- manual|autodebito
  cuenta_pago text,
  fecha_corte date,
  cuota_redirected boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists debt_payments (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  debt_id text not null references debts(id) on delete cascade,
  fecha date not null,
  monto bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_dp_user on debt_payments(user_id, fecha desc);

create table if not exists goals (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  tipo text not null,                           -- colchon|fondo_emergencia
  meta bigint not null,
  actual bigint not null default 0,
  label text
);

create table if not exists accounts (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  balance bigint not null default 0,
  color text
);

create table if not exists allocation_rules (
  user_id uuid not null references auth.users on delete cascade,
  phase int not null,
  deuda numeric not null default 0,
  colchon numeric not null default 0,
  inversion numeric not null default 0,
  libre numeric not null default 0,
  primary key (user_id, phase)
);

create table if not exists budgets (
  user_id uuid not null references auth.users on delete cascade,
  category text not null,
  monthly_limit bigint not null default 0,
  primary key (user_id, category)
);

-- Fase C (se crean ya para no migrar después)
create table if not exists bill_providers (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  sender_pattern text not null,                 -- ej: %@enel.com.co
  parser_key text not null,                     -- enel|vanti|eaab|movistar
  pending_item_id text references pending_items(id) on delete set null,
  last_seen_at timestamptz
);

-- ── RLS: cada usuario solo ve y toca lo suyo ──────────────────
alter table profiles enable row level security;
alter table transactions enable row level security;
alter table pending_items enable row level security;
alter table debts enable row level security;
alter table debt_payments enable row level security;
alter table goals enable row level security;
alter table accounts enable row level security;
alter table allocation_rules enable row level security;
alter table budgets enable row level security;
alter table bill_providers enable row level security;

create policy "own profile" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own tx" on transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own pending" on pending_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own debts" on debts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own debt_payments" on debt_payments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own goals" on goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own accounts" on accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rules" on allocation_rules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own budgets" on budgets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own providers" on bill_providers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime para sincronía entre dispositivos
alter publication supabase_realtime add table transactions, pending_items, debts, debt_payments, goals, accounts;

-- ── Insights con IA (caché) ──────────────────────────────────
-- Guarda el último análisis generado para no pagar por cada apertura.
-- data_hash detecta si los movimientos cambiaron desde el último análisis.
create table if not exists insights_cache (
  user_id uuid primary key references auth.users on delete cascade,
  generated_at timestamptz not null default now(),
  data_hash text not null,
  payload jsonb not null
);
alter table insights_cache enable row level security;
create policy "own insights" on insights_cache
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
