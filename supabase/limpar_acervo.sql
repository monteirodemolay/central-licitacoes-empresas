-- ==============================================================================
-- LIMPEZA DEFINITIVA DO ACERVO — CERTIDÕES, DOCUMENTOS E BALANÇOS
-- ==============================================================================
--
-- ATENÇÃO: este script APAGA PERMANENTEMENTE, sem passar pela lixeira e sem
-- possibilidade de recuperação, todas as linhas de:
--   - public.certidoes
--   - public.documentos_empresa
--   - public.balancos
--
-- Ele NÃO apaga: empresas, editais/licitações, checklist (só desvincula o que
-- apontava para um documento apagado), agenda, pacotes nem contas de usuário.
--
-- Ele NÃO apaga os arquivos já enviados ao Storage (bucket "documentos") — só
-- os registros do banco que apontam para eles. Os arquivos ficam órfãos, sem
-- aparecer em lugar nenhum do sistema; se quiser liberar o espaço, apague-os
-- manualmente pelo painel do Supabase em Storage → documentos.
--
-- Este arquivo NÃO faz parte da rotina de migração (schema.sql e os
-- atualizacao_*.sql): é de uso único e manual. Rode só quando tiver certeza —
-- não há "desfazer" depois de rodar.
--
-- Como usar: abra o SQL Editor do Supabase, cole o conteúdo abaixo e rode.
-- Se quiser limpar só UMA empresa em vez de todas, veja a variante comentada
-- ao final de cada bloco.
-- ==============================================================================

-- 0. Conferência antes de apagar --------------------------------------------
-- Rode só este bloco primeiro, se quiser ver quantas linhas serão afetadas
-- antes de continuar.
select
  (select count(*) from public.certidoes) as certidoes,
  (select count(*) from public.documentos_empresa) as documentos_empresa,
  (select count(*) from public.balancos) as balancos,
  (select count(*) from public.licitacao_checklist_itens
     where documento_ref_tabela is not null) as itens_de_checklist_vinculados;

-- 1. Desvincula itens de checklist que apontavam para o que vai ser apagado --
-- Sem isso, o checklist de um edital ficaria com o botão "Abrir" apontando
-- para um arquivo que não existe mais. O item volta a aparecer como pendente.
update public.licitacao_checklist_itens
   set documento_ref_tabela = null,
       documento_ref_id = null,
       documento_ref_path = null,
       validade = null,
       status = 'ausente'
 where documento_ref_tabela in ('certidoes','documentos_empresa','balancos');

-- 2. Apaga os registros -------------------------------------------------------
delete from public.certidoes;
delete from public.documentos_empresa;
delete from public.balancos;

-- Variante: limpar só uma empresa, em vez de todas ---------------------------
-- Troque 'SEU-EMPRESA-ID-AQUI' pelo id da empresa (veja em public.empresas)
-- e rode isto em vez do bloco 2 acima:
--
-- update public.licitacao_checklist_itens
--    set documento_ref_tabela = null, documento_ref_id = null, documento_ref_path = null,
--        validade = null, status = 'ausente'
--  where empresa_id = 'SEU-EMPRESA-ID-AQUI'
--    and documento_ref_tabela in ('certidoes','documentos_empresa','balancos');
-- delete from public.certidoes where empresa_id = 'SEU-EMPRESA-ID-AQUI';
-- delete from public.documentos_empresa where empresa_id = 'SEU-EMPRESA-ID-AQUI';
-- delete from public.balancos where empresa_id = 'SEU-EMPRESA-ID-AQUI';

-- 3. Conferência depois de apagar ---------------------------------------------
select
  (select count(*) from public.certidoes) as certidoes,
  (select count(*) from public.documentos_empresa) as documentos_empresa,
  (select count(*) from public.balancos) as balancos;
