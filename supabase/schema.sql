-- LicitaDoc: execute este arquivo uma única vez no SQL Editor do Supabase.
-- A primeira conta criada no aplicativo será o administrador geral.

create extension if not exists pgcrypto;

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text,
  cnpj text not null unique,
  municipio text,
  uf char(2),
  atividades text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.empresas add column if not exists data_abertura date;
alter table public.empresas add column if not exists natureza_juridica text;
alter table public.empresas add column if not exists porte text;

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text,
  perfil text not null default 'pendente' check (perfil in ('admin_geral','proprietario_empresa','pendente')),
  empresa_id uuid references public.empresas(id) on delete set null,
  criado_em timestamptz not null default now()
);

create table if not exists public.certidoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null,
  orgao_emissor text,
  emissao date,
  validade date not null,
  link_emissao text,
  arquivo_path text,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

create table if not exists public.licitacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  numero text not null,
  orgao text not null,
  objeto text not null,
  abertura date,
  modalidade text,
  requisitos jsonb not null default '[]'::jsonb,
  edital_path text,
  texto_extraido text,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.licitacoes add column if not exists requisitos_proposta jsonb not null default '[]'::jsonb;
alter table public.licitacoes add column if not exists declaracoes jsonb not null default '[]'::jsonb;
alter table public.licitacoes add column if not exists itens jsonb not null default '[]'::jsonb;

create table if not exists public.balancos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  exercicio smallint not null check (exercicio between 1900 and 2200),
  tipo_documento text not null default 'Balanço anual',
  periodo_inicio date,
  periodo_fim date not null,
  data_registro date,
  orgao_registro text,
  arquivo_path text not null,
  observacoes text,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

create table if not exists public.pacotes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  licitacao_id uuid not null references public.licitacoes(id) on delete cascade,
  nome text not null,
  status text not null default 'pendente' check (status in ('pendente','pronto','enviado','arquivado')),
  documentos jsonb not null default '[]'::jsonb,
  proposta jsonb not null default '{}'::jsonb,
  declaracoes jsonb not null default '[]'::jsonb,
  itens jsonb not null default '[]'::jsonb,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_perfis_empresa on public.perfis(empresa_id);
create index if not exists idx_certidoes_empresa on public.certidoes(empresa_id);
create index if not exists idx_certidoes_validade on public.certidoes(validade);
create index if not exists idx_licitacoes_empresa on public.licitacoes(empresa_id);
create index if not exists idx_licitacoes_abertura on public.licitacoes(abertura);
create index if not exists idx_balancos_empresa_exercicio on public.balancos(empresa_id,exercicio);
create index if not exists idx_pacotes_empresa_licitacao on public.pacotes(empresa_id,licitacao_id);

create or replace function public.meu_perfil()
returns text language sql stable security definer set search_path=public
as $$ select perfil from public.perfis where id=auth.uid() $$;

create or replace function public.minha_empresa()
returns uuid language sql stable security definer set search_path=public
as $$ select empresa_id from public.perfis where id=auth.uid() $$;

revoke all on function public.meu_perfil() from public;
revoke all on function public.minha_empresa() from public;
grant execute on function public.meu_perfil() to authenticated;
grant execute on function public.minha_empresa() to authenticated;

create or replace function public.novo_usuario()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.perfis (id,email,nome,perfil)
  values (
    new.id,
    coalesce(new.email,''),
    coalesce(new.raw_user_meta_data->>'nome',''),
    case when not exists(select 1 from public.perfis where perfil='admin_geral')
      then 'admin_geral' else 'pendente' end
  );
  return new;
end;
$$;

drop trigger if exists criar_perfil_ao_cadastrar on auth.users;
create trigger criar_perfil_ao_cadastrar after insert on auth.users
for each row execute procedure public.novo_usuario();

alter table public.empresas enable row level security;
alter table public.perfis enable row level security;
alter table public.certidoes enable row level security;
alter table public.licitacoes enable row level security;
alter table public.balancos enable row level security;
alter table public.pacotes enable row level security;

drop policy if exists "perfis leitura" on public.perfis;
create policy "perfis leitura" on public.perfis for select to authenticated
using (id=auth.uid() or public.meu_perfil()='admin_geral');

drop policy if exists "perfis admin atualiza" on public.perfis;
create policy "perfis admin atualiza" on public.perfis for update to authenticated
using (public.meu_perfil()='admin_geral') with check (public.meu_perfil()='admin_geral');

drop policy if exists "empresas leitura" on public.empresas;
create policy "empresas leitura" on public.empresas for select to authenticated
using (public.meu_perfil()='admin_geral' or id=public.minha_empresa());
drop policy if exists "empresas insercao" on public.empresas;
create policy "empresas insercao" on public.empresas for insert to authenticated
with check (public.meu_perfil()='admin_geral');
drop policy if exists "empresas atualizacao" on public.empresas;
create policy "empresas atualizacao" on public.empresas for update to authenticated
using (public.meu_perfil()='admin_geral' or id=public.minha_empresa())
with check (public.meu_perfil()='admin_geral' or id=public.minha_empresa());

drop policy if exists "certidoes leitura" on public.certidoes;
create policy "certidoes leitura" on public.certidoes for select to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "certidoes insercao" on public.certidoes;
create policy "certidoes insercao" on public.certidoes for insert to authenticated
with check (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "certidoes atualizacao" on public.certidoes;
create policy "certidoes atualizacao" on public.certidoes for update to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa())
with check (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "certidoes exclusao" on public.certidoes;
create policy "certidoes exclusao" on public.certidoes for delete to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());

drop policy if exists "licitacoes leitura" on public.licitacoes;
create policy "licitacoes leitura" on public.licitacoes for select to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "licitacoes insercao" on public.licitacoes;
create policy "licitacoes insercao" on public.licitacoes for insert to authenticated
with check (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "licitacoes atualizacao" on public.licitacoes;
create policy "licitacoes atualizacao" on public.licitacoes for update to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa())
with check (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "licitacoes exclusao" on public.licitacoes;
create policy "licitacoes exclusao" on public.licitacoes for delete to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());

drop policy if exists "balancos leitura" on public.balancos;
create policy "balancos leitura" on public.balancos for select to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "balancos insercao" on public.balancos;
create policy "balancos insercao" on public.balancos for insert to authenticated
with check (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "balancos atualizacao" on public.balancos;
create policy "balancos atualizacao" on public.balancos for update to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa())
with check (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "balancos exclusao" on public.balancos;
create policy "balancos exclusao" on public.balancos for delete to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());

drop policy if exists "pacotes leitura" on public.pacotes;
create policy "pacotes leitura" on public.pacotes for select to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "pacotes insercao" on public.pacotes;
create policy "pacotes insercao" on public.pacotes for insert to authenticated
with check (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "pacotes atualizacao" on public.pacotes;
create policy "pacotes atualizacao" on public.pacotes for update to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa())
with check (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "pacotes exclusao" on public.pacotes;
create policy "pacotes exclusao" on public.pacotes for delete to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('documentos','documentos',false,52428800,array['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public=false;

drop policy if exists "documentos leitura" on storage.objects;
create policy "documentos leitura" on storage.objects for select to authenticated
using (bucket_id='documentos' and (public.meu_perfil()='admin_geral' or (storage.foldername(name))[1]=public.minha_empresa()::text));
drop policy if exists "documentos insercao" on storage.objects;
create policy "documentos insercao" on storage.objects for insert to authenticated
with check (bucket_id='documentos' and (public.meu_perfil()='admin_geral' or (storage.foldername(name))[1]=public.minha_empresa()::text));
drop policy if exists "documentos exclusao" on storage.objects;
create policy "documentos exclusao" on storage.objects for delete to authenticated
using (bucket_id='documentos' and (public.meu_perfil()='admin_geral' or (storage.foldername(name))[1]=public.minha_empresa()::text));

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.empresas,public.certidoes,public.balancos,public.licitacoes,public.pacotes to authenticated;
grant select,update on public.perfis to authenticated;
