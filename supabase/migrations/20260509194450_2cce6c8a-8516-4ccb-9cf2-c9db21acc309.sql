
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  despacho_nombre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, despacho_nombre)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'despacho_nombre', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at trigger
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- Clientes (contables)
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rfc text not null,
  razon_social text not null,
  regimen_fiscal text,
  semaforo text not null default 'verde' check (semaforo in ('verde','amarillo','rojo')),
  obligaciones int not null default 0,
  estado_mes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clientes_user_id_idx on public.clientes(user_id);

alter table public.clientes enable row level security;

create policy "Users view own clientes" on public.clientes for select using (auth.uid() = user_id);
create policy "Users insert own clientes" on public.clientes for insert with check (auth.uid() = user_id);
create policy "Users update own clientes" on public.clientes for update using (auth.uid() = user_id);
create policy "Users delete own clientes" on public.clientes for delete using (auth.uid() = user_id);

create trigger clientes_set_updated_at
  before update on public.clientes
  for each row execute function public.tg_set_updated_at();
