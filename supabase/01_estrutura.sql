-- =====================================================================
-- Painel do Quiabo — estrutura do banco (Supabase / Postgres)
-- Rode este arquivo inteiro uma vez no SQL Editor do Supabase.
-- =====================================================================

-- ---------- Sócios com acesso ----------
create table if not exists public.socios (
  email text primary key,
  nome  text not null
);

-- Verdadeiro quando o usuário logado está na lista de sócios.
create or replace function public.eh_socio()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.socios s
    where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- Cotações da CEASA-ES (quiabo extra, R$/kg) ----------
-- Só a coleta automática (chave de serviço) grava aqui.
create table if not exists public.precos (
  data          date primary key,
  min           numeric(10,2),
  comum         numeric(10,2) not null check (comum >= 0),
  max           numeric(10,2),
  sit           text,
  atualizado_em timestamptz not null default now()
);

-- ---------- Configuração do preço usado nos cálculos ----------
create table if not exists public.config (
  id            int primary key default 1 check (id = 1),
  fonte         text not null default 'ceasa' check (fonte in ('ceasa','proprio')),
  ref           text not null default 'comum' check (ref in ('min','comum','max')),
  preco_proprio numeric(10,2) check (preco_proprio is null or preco_proprio > 0),
  kg_por_caixa  numeric(6,2) not null default 14 check (kg_por_caixa > 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
insert into public.config (id) values (1) on conflict (id) do nothing;

-- ---------- Entradas de quiabo (colheita) ----------
create table if not exists public.colheitas (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  kg          numeric(10,1) not null check (kg > 0),
  caixas      numeric(10,1),
  obs         text,
  autor_email text default (auth.jwt() ->> 'email'),
  criado_em   timestamptz not null default now()
);

-- ---------- Vendas ----------
create table if not exists public.vendas (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  kg          numeric(10,1) not null check (kg > 0),
  preco_kg    numeric(10,2) not null check (preco_kg > 0),
  total       numeric(12,2) generated always as (round(kg * preco_kg, 2)) stored,
  cliente     text,
  pago        boolean not null default false,
  pago_em     timestamptz,
  autor_email text default (auth.jwt() ->> 'email'),
  criado_em   timestamptz not null default now()
);

-- ---------- Despesas ----------
create table if not exists public.despesas (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  valor       numeric(12,2) not null check (valor > 0),
  categoria   text not null default 'Outros',
  descricao   text,
  autor_email text default (auth.jwt() ->> 'email'),
  criado_em   timestamptz not null default now()
);

create index if not exists colheitas_data_idx on public.colheitas (data desc);
create index if not exists vendas_data_idx    on public.vendas (data desc);
create index if not exists despesas_data_idx  on public.despesas (data desc);

-- ---------- Segurança: só os sócios leem e gravam ----------
alter table public.socios    enable row level security;
alter table public.precos    enable row level security;
alter table public.config    enable row level security;
alter table public.colheitas enable row level security;
alter table public.vendas    enable row level security;
alter table public.despesas  enable row level security;

drop policy if exists socios_le on public.socios;
create policy socios_le on public.socios for select to authenticated using (public.eh_socio());

drop policy if exists precos_le on public.precos;
create policy precos_le on public.precos for select to authenticated using (public.eh_socio());

drop policy if exists config_le on public.config;
create policy config_le on public.config for select to authenticated using (public.eh_socio());
drop policy if exists config_muda on public.config;
create policy config_muda on public.config for update to authenticated using (public.eh_socio()) with check (public.eh_socio());

drop policy if exists colheitas_tudo on public.colheitas;
create policy colheitas_tudo on public.colheitas for all to authenticated using (public.eh_socio()) with check (public.eh_socio());

drop policy if exists vendas_tudo on public.vendas;
create policy vendas_tudo on public.vendas for all to authenticated using (public.eh_socio()) with check (public.eh_socio());

drop policy if exists despesas_tudo on public.despesas;
create policy despesas_tudo on public.despesas for all to authenticated using (public.eh_socio()) with check (public.eh_socio());

-- ---------- Atualização ao vivo entre os dois celulares ----------
do $$
declare t text;
begin
  foreach t in array array['precos','config','colheitas','vendas','despesas'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- QUEM TEM ACESSO ----------
-- Um único usuário, "daniel", usado pelos dois sócios.
-- No app ele digita só "daniel"; por dentro o login usa este e-mail.
-- A senha NÃO fica aqui: ela é cadastrada em Authentication > Users > Add user.
insert into public.socios (email, nome) values
  ('daniel@painel-quiabo.app', 'Daniel')
on conflict (email) do update set nome = excluded.nome;
