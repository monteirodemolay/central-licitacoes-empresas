-- LiciDoc: atualização para acervo, balanços, análise de editais e pacotes por processo.
-- Pode ser executado novamente no SQL Editor do Supabase; os comandos são idempotentes.

alter table public.empresas add column if not exists data_abertura date;
alter table public.empresas add column if not exists natureza_juridica text;
alter table public.empresas add column if not exists porte text;

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

create index if not exists idx_balancos_empresa_exercicio
on public.balancos(empresa_id,exercicio);

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

create index if not exists idx_pacotes_empresa_licitacao
on public.pacotes(empresa_id,licitacao_id);

create table if not exists public.documentos_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  categoria text not null,
  tipo text not null,
  nome_original text not null,
  arquivo_path text not null,
  origem text,
  pasta_origem text,
  data_documento date,
  validade date,
  sha256 text,
  metadados jsonb not null default '{}'::jsonb,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  unique (empresa_id,sha256)
);

create index if not exists idx_documentos_empresa_categoria
on public.documentos_empresa(empresa_id,categoria);

alter table public.balancos enable row level security;
alter table public.pacotes enable row level security;
alter table public.documentos_empresa enable row level security;

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

grant select,insert,update,delete on public.balancos to authenticated;

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

grant select,insert,update,delete on public.pacotes to authenticated;

drop policy if exists "documentos empresa leitura" on public.documentos_empresa;
create policy "documentos empresa leitura" on public.documentos_empresa for select to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());

drop policy if exists "documentos empresa insercao" on public.documentos_empresa;
create policy "documentos empresa insercao" on public.documentos_empresa for insert to authenticated
with check (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());

drop policy if exists "documentos empresa atualizacao" on public.documentos_empresa;
create policy "documentos empresa atualizacao" on public.documentos_empresa for update to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa())
with check (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());

drop policy if exists "documentos empresa exclusao" on public.documentos_empresa;
create policy "documentos empresa exclusao" on public.documentos_empresa for delete to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());

grant select,insert,update,delete on public.documentos_empresa to authenticated;

update storage.buckets
set file_size_limit=52428800,
    allowed_mime_types=array['application/pdf','image/png','image/jpeg','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','text/plain']
where id='documentos';
