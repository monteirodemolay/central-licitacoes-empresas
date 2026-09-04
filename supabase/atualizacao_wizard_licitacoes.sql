-- LiciDoc: atualização para o assistente de habilitação (Lei 14.133/2021) e a agenda de interesse.
-- Pode ser executado novamente no SQL Editor do Supabase; os comandos são idempotentes.

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

-- 5e. Vários documentos por item do checklist ---------------------------------
-- Um item do checklist (ex.: "documento de identificação do representante
-- legal") pode precisar de mais de um arquivo — vários sócios, vários
-- responsáveis técnicos. `documento_ref_*` continua existindo e espelha o
-- primeiro da lista, para quem ainda lê só esse formato; `documentos_vinculados`
-- é a lista completa, no formato [{tabela,id,path,validade,nome}, ...].

alter table public.licitacao_checklist_itens add column if not exists documentos_vinculados jsonb not null default '[]'::jsonb;

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
