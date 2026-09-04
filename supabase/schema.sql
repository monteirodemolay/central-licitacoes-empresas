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

alter table public.empresas add column if not exists excluido_em timestamptz;
alter table public.empresas add column if not exists excluido_por uuid references auth.users(id);
alter table public.certidoes add column if not exists excluido_em timestamptz;
alter table public.certidoes add column if not exists excluido_por uuid references auth.users(id);
alter table public.documentos_empresa add column if not exists excluido_em timestamptz;
alter table public.documentos_empresa add column if not exists excluido_por uuid references auth.users(id);
alter table public.balancos add column if not exists excluido_em timestamptz;
alter table public.balancos add column if not exists excluido_por uuid references auth.users(id);
alter table public.licitacoes add column if not exists excluido_em timestamptz;
alter table public.licitacoes add column if not exists excluido_por uuid references auth.users(id);
alter table public.pacotes add column if not exists excluido_em timestamptz;
alter table public.pacotes add column if not exists excluido_por uuid references auth.users(id);

create index if not exists idx_perfis_empresa on public.perfis(empresa_id);
create index if not exists idx_certidoes_empresa on public.certidoes(empresa_id);
create index if not exists idx_certidoes_validade on public.certidoes(validade);
create index if not exists idx_documentos_empresa_categoria on public.documentos_empresa(empresa_id,categoria);
create index if not exists idx_licitacoes_empresa on public.licitacoes(empresa_id);
create index if not exists idx_licitacoes_abertura on public.licitacoes(abertura);
create index if not exists idx_balancos_empresa_exercicio on public.balancos(empresa_id,exercicio);
create index if not exists idx_pacotes_empresa_licitacao on public.pacotes(empresa_id,licitacao_id);
create index if not exists idx_empresas_excluido_em on public.empresas(excluido_em);
create index if not exists idx_certidoes_excluido_em on public.certidoes(excluido_em);
create index if not exists idx_documentos_empresa_excluido_em on public.documentos_empresa(excluido_em);
create index if not exists idx_balancos_excluido_em on public.balancos(excluido_em);
create index if not exists idx_licitacoes_excluido_em on public.licitacoes(excluido_em);
create index if not exists idx_pacotes_excluido_em on public.pacotes(excluido_em);

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
alter table public.documentos_empresa enable row level security;
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
drop policy if exists "empresas exclusao" on public.empresas;
create policy "empresas exclusao" on public.empresas for delete to authenticated
using (public.meu_perfil()='admin_geral');

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
values ('documentos','documentos',false,52428800,array['application/pdf','image/png','image/jpeg','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','text/plain'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

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
grant select,insert,update,delete on public.empresas,public.certidoes,public.documentos_empresa,public.balancos,public.licitacoes,public.pacotes to authenticated;
grant select,update on public.perfis to authenticated;

-- ============================================================================
-- Assistente de habilitação (Lei 14.133/2021) e agenda de interesse.
-- Mesmo conteúdo de supabase/atualizacao_wizard_licitacoes.sql, incorporado
-- aqui para que uma instalação nova já nasça completa.
-- ============================================================================


-- 1. Taxonomia da Lei 14.133/2021 em public.licitacoes ------------------------

alter table public.licitacoes add column if not exists tem_certame boolean not null default true;
alter table public.licitacoes add column if not exists modalidade_padrao text;
alter table public.licitacoes add column if not exists forma_contratacao_direta text;
alter table public.licitacoes add column if not exists fundamento_legal text;
alter table public.licitacoes add column if not exists tipo_objeto text;
alter table public.licitacoes add column if not exists criterio_julgamento text;
alter table public.licitacoes add column if not exists modo_disputa text;
alter table public.licitacoes add column if not exists regime_execucao text;
alter table public.licitacoes add column if not exists exclusividade_me_epp text default 'nao';
alter table public.licitacoes add column if not exists valor_estimado numeric(18,2);
alter table public.licitacoes add column if not exists procedimento_auxiliar text;
alter table public.licitacoes add column if not exists status_processo text default 'rascunho';
alter table public.licitacoes add column if not exists link_portal text;
alter table public.licitacoes add column if not exists hora_sessao time;

alter table public.licitacoes drop constraint if exists licitacoes_modalidade_padrao_check;
alter table public.licitacoes add constraint licitacoes_modalidade_padrao_check
  check (modalidade_padrao is null or modalidade_padrao in
    ('pregao','concorrencia','concurso','leilao','dialogo_competitivo'));

alter table public.licitacoes drop constraint if exists licitacoes_forma_contratacao_direta_check;
alter table public.licitacoes add constraint licitacoes_forma_contratacao_direta_check
  check (forma_contratacao_direta is null or forma_contratacao_direta in ('dispensa','inexigibilidade'));

alter table public.licitacoes drop constraint if exists licitacoes_tipo_objeto_check;
alter table public.licitacoes add constraint licitacoes_tipo_objeto_check
  check (tipo_objeto is null or tipo_objeto in
    ('bens_comuns','servicos_comuns','servicos_comuns_engenharia','obras',
     'servicos_especiais_engenharia','servicos_especiais_intelectuais','locacao_imoveis','alienacao_bens'));

alter table public.licitacoes drop constraint if exists licitacoes_exclusividade_me_epp_check;
alter table public.licitacoes add constraint licitacoes_exclusividade_me_epp_check
  check (exclusividade_me_epp is null or exclusividade_me_epp in ('sim','cota','nao'));

alter table public.licitacoes drop constraint if exists licitacoes_status_processo_check;
alter table public.licitacoes add constraint licitacoes_status_processo_check
  check (status_processo is null or status_processo in
    ('rascunho','em_conferencia','pronto','enviado','arquivado'));

-- 2. Agenda de interesse ------------------------------------------------------
-- Marca o quanto a empresa quer disputar um edital mesmo antes de ter toda a
-- documentação pronta, para o processo aparecer na agenda com contagem regressiva.

alter table public.licitacoes add column if not exists interesse text default 'em_analise';
alter table public.licitacoes add column if not exists prioridade text default 'media';
alter table public.licitacoes add column if not exists responsavel text;
alter table public.licitacoes add column if not exists anotacoes text;
alter table public.licitacoes add column if not exists decidir_ate date;

alter table public.licitacoes drop constraint if exists licitacoes_interesse_check;
alter table public.licitacoes add constraint licitacoes_interesse_check
  check (interesse is null or interesse in
    ('em_analise','vamos_participar','sem_interesse','participamos'));

alter table public.licitacoes drop constraint if exists licitacoes_prioridade_check;
alter table public.licitacoes add constraint licitacoes_prioridade_check
  check (prioridade is null or prioridade in ('alta','media','baixa'));

-- 3. Checklist granular por processo ------------------------------------------
-- empresa_id é duplicado de propósito: mantém a policy de RLS no mesmo padrão
-- simples das demais tabelas, sem join.

create table if not exists public.licitacao_checklist_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  licitacao_id uuid not null references public.licitacoes(id) on delete cascade,
  chave text not null,
  bloco text not null check (bloco in
    ('juridica','fiscal_trabalhista','economico_financeira','tecnica','proposta','declaracoes','processo_contratacao_direta')),
  titulo text not null,
  base_legal text,
  ordem smallint not null default 0,
  obrigatorio boolean not null default true,
  aplicavel boolean not null default true,
  justificativa_nao_aplicavel text,
  documento_ref_tabela text check (documento_ref_tabela is null or documento_ref_tabela in
    ('certidoes','documentos_empresa','balancos')),
  documento_ref_id uuid,
  documento_ref_path text,
  validade date,
  status text not null default 'pendente' check (status in
    ('ok','vencido','ausente','pendente','nao_aplicavel','gerado')),
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (licitacao_id,chave)
);

create index if not exists idx_checklist_licitacao on public.licitacao_checklist_itens(licitacao_id);
create index if not exists idx_checklist_empresa_status on public.licitacao_checklist_itens(empresa_id,status);

-- 4. Providências da agenda ---------------------------------------------------
-- O que precisa ser providenciado até quando. Nasce de uma pendência do
-- checklist ou é criada à mão pelo usuário.

create table if not exists public.agenda_tarefas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  licitacao_id uuid references public.licitacoes(id) on delete cascade,
  checklist_item_id uuid references public.licitacao_checklist_itens(id) on delete set null,
  titulo text not null,
  detalhe text,
  prazo date,
  responsavel text,
  origem text not null default 'manual' check (origem in ('manual','checklist')),
  concluida boolean not null default false,
  concluida_em timestamptz,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_agenda_empresa_prazo on public.agenda_tarefas(empresa_id,concluida,prazo);
create index if not exists idx_agenda_licitacao on public.agenda_tarefas(licitacao_id);

-- 5. Parâmetros legais com vigência -------------------------------------------
-- Os valores mudam por decreto todo ano: ficam aqui, não no código.

create table if not exists public.parametros_legais (
  chave text primary key,
  descricao text,
  valor numeric(18,2) not null,
  vigencia_inicio date not null,
  fonte text,
  atualizado_em timestamptz not null default now()
);

insert into public.parametros_legais (chave,descricao,valor,vigencia_inicio,fonte) values
  ('dispensa_art75_I','Art. 75, I — Obras e serviços de engenharia',130984.20,'2026-01-01','Decreto nº 12.807/2025'),
  ('dispensa_art75_II','Art. 75, II — Compras e demais serviços',65492.11,'2026-01-01','Decreto nº 12.807/2025'),
  ('dispensa_art75_p7','Art. 75, §7º — Peças e manutenção de veículos',10478.74,'2026-01-01','Decreto nº 12.807/2025'),
  ('contrato_verbal_art95','Art. 95, §2º — Contrato verbal (exceção)',13098.41,'2026-01-01','Decreto nº 12.807/2025'),
  ('inexigibilidade_servicos_tecnicos','Referência para serviços técnicos especializados',392952.63,'2026-01-01','Decreto nº 12.807/2025')
on conflict (chave) do update set
  descricao=excluded.descricao,valor=excluded.valor,
  vigencia_inicio=excluded.vigencia_inicio,fonte=excluded.fonte,atualizado_em=now();

-- 5b. Critério de arquivamento do acervo -------------------------------------
-- `tipo` continua livre para o rótulo que o usuário lê; `tipo_chave` aponta para
-- o catálogo fechado, e é ele que decide qual documento vale hoje.

alter table public.documentos_empresa add column if not exists tipo_chave text;
alter table public.certidoes add column if not exists tipo_chave text;
alter table public.balancos add column if not exists tipo_chave text;

create index if not exists idx_documentos_empresa_tipo_chave
  on public.documentos_empresa(empresa_id,tipo_chave);

-- 5c. Responsável técnico -----------------------------------------------------
-- Registro de conselho profissional pessoa física, ART/RRT, vínculo e atestado
-- de capacidade técnico-profissional pertencem a uma pessoa específica, não à
-- empresa; sem o nome não dá para distinguir o registro de um profissional do
-- de outro quando a empresa tem mais de um responsável técnico.

alter table public.documentos_empresa add column if not exists responsavel_tecnico text;
alter table public.certidoes add column if not exists responsavel_tecnico text;

-- 5d. Arquivamento manual dentro dos tipos acumulativos -----------------------
-- Em tipos "acumulativo" (vários arquivos somam ao mesmo tempo — atestados,
-- ART/RRT, responsável técnico, representante legal), o sistema escolhe o
-- mais recente como o "vigente" em destaque. Isso nem sempre é o que vale de
-- fato: um responsável técnico pode ter saído da empresa mesmo tendo o
-- registro mais novo. `arquivado` deixa o usuário tirar manualmente um
-- arquivo da disputa por "vigente", sem apagar nem perder o arquivo.

alter table public.documentos_empresa add column if not exists arquivado boolean not null default false;
alter table public.certidoes add column if not exists arquivado boolean not null default false;

-- 6. RLS ----------------------------------------------------------------------

alter table public.licitacao_checklist_itens enable row level security;
alter table public.agenda_tarefas enable row level security;
alter table public.parametros_legais enable row level security;

drop policy if exists "checklist leitura" on public.licitacao_checklist_itens;
create policy "checklist leitura" on public.licitacao_checklist_itens for select to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "checklist insercao" on public.licitacao_checklist_itens;
create policy "checklist insercao" on public.licitacao_checklist_itens for insert to authenticated
with check (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "checklist atualizacao" on public.licitacao_checklist_itens;
create policy "checklist atualizacao" on public.licitacao_checklist_itens for update to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa())
with check (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "checklist exclusao" on public.licitacao_checklist_itens;
create policy "checklist exclusao" on public.licitacao_checklist_itens for delete to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());

drop policy if exists "agenda leitura" on public.agenda_tarefas;
create policy "agenda leitura" on public.agenda_tarefas for select to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "agenda insercao" on public.agenda_tarefas;
create policy "agenda insercao" on public.agenda_tarefas for insert to authenticated
with check (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "agenda atualizacao" on public.agenda_tarefas;
create policy "agenda atualizacao" on public.agenda_tarefas for update to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa())
with check (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());
drop policy if exists "agenda exclusao" on public.agenda_tarefas;
create policy "agenda exclusao" on public.agenda_tarefas for delete to authenticated
using (public.meu_perfil()='admin_geral' or empresa_id=public.minha_empresa());

-- Os parâmetros legais são a mesma tabela pública de referência para todos;
-- leitura liberada a quem está autenticado, escrita só pelo administrador geral.
drop policy if exists "parametros leitura" on public.parametros_legais;
create policy "parametros leitura" on public.parametros_legais for select to authenticated
using (true);
drop policy if exists "parametros escrita" on public.parametros_legais;
create policy "parametros escrita" on public.parametros_legais for all to authenticated
using (public.meu_perfil()='admin_geral') with check (public.meu_perfil()='admin_geral');

grant select,insert,update,delete on public.licitacao_checklist_itens,public.agenda_tarefas to authenticated;
grant select,insert,update,delete on public.parametros_legais to authenticated;
