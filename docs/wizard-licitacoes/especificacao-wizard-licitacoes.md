# Especificação — Wizard de Elaboração de Licitações (LiciDoc)

**Repositório analisado:** `monteirodemolay/central-licitacoes-empresas`
**Base legal:** Lei nº 14.133/2021 (Nova Lei de Licitações e Contratos Administrativos), Decreto nº 12.807/2025 (valores 2026), LC 123/2006 (ME/EPP)
**Objetivo do documento:** servir de blueprint completo — fluxo de telas, taxonomia, matriz de documentos, regras de crítica, schema de dados e plano de implementação — para ser colado em outra ferramenta (ChatGPT ou qualquer LLM) que vai efetivamente codificar as mudanças no sistema, sem que ela precise reabrir o repositório do zero.

---

## 0. Como usar este documento

Cole este arquivo inteiro na conversa com a IA que vai programar. Ele contém, na Seção 10 (Apêndice A), o contexto técnico mínimo do repositório atual (stack, tabelas, funções existentes, convenções) para que o código gerado seja compatível com o que já existe, sem necessidade de acesso ao GitHub. As Seções 3 a 8 são a especificação funcional em si (o "o quê" e o "porquê"); a Seção 9 é o roteiro de implementação em fases ("o como", em ordem).

---

## 1. Diagnóstico do sistema atual

O LiciDoc hoje já resolve boa parte da base documental, mas o cadastro de licitação ainda é raso:

- O cadastro de edital é **um único formulário/modal** (`openModal('notice')`), não um wizard. Todos os campos (empresa, número, órgão, objeto, abertura, modalidade, requisitos, declarações, proposta) ficam numa tela só.
- **Modalidade é texto livre** (`<input name="modality">`), sem taxonomia oficial da Lei 14.133/2021. Isso impede qualquer regra automática por modalidade.
- Não existe **tipo de objeto** (bens, serviços comuns, obras, serviços especiais de engenharia etc.) como campo estruturado.
- A leitura de PDF (`extractPdf`/`analyzeNoticeText`) já faz uma extração heurística por regex de: número, órgão, objeto, modalidade (texto), data de abertura, uma lista solta de "requisitos" (certidões), exigências de proposta e declarações. É útil como *pré-preenchimento*, mas não é uma matriz normativa — é best effort sobre o texto do edital.
- A montagem do pacote (`createProcessPackage`) já cruza os "requisitos" (texto livre) com o acervo de certidões da empresa via regex (`requirementCertificateType`) e pega a certidão mais nova válida na data de abertura (`newestCertificate`). Isso é o embrião do "motor de crítica", mas funciona só para certidões, não para habilitação jurídica, técnica ou econômico-financeira, e não é sensível a modalidade/objeto.
- O ZIP final (`downloadProcessPackage`) já gera: pasta por categoria de documento, proposta de preços em `.doc` (HTML), declarações em `.doc`, planilha de itens em `.xlsx` e um `00-checklist.txt`. A estrutura de pastas é boa; falta ela variar por modalidade e incluir habilitação jurídica/técnica/econômico-financeira.

**Conclusão do diagnóstico:** a infraestrutura (Supabase + JSZip + SheetJS + leitor de PDF) já está pronta para sustentar o wizard. O que falta é (a) estruturar a modalidade e o tipo de objeto como taxonomia fechada, (b) uma matriz de documentos exigíveis por modalidade/objeto, (c) um motor de crítica mais completo (não só certidão x validade) e (d) quebrar o formulário único em etapas.

---

## 2. Objetivo e princípios do wizard

**Objetivo:** conforme os dados forem sendo inseridos (manualmente ou extraídos do edital em PDF), o sistema vai classificando a licitação, calculando automaticamente **quais documentos são exigíveis** para aquele caso concreto, cruzando com o que a empresa já tem cadastrado, sinalizando pendências e inconsistências ("crítica"), até chegar num estado "pronto para gerar pacote" — e então gera o ZIP final organizado por tipo de licitação e modalidade.

**Princípios de design:**

1. **Wizard incremental, não bloqueante.** O usuário pode avançar mesmo com pendências; o que muda é o *status* (rascunho → em conferência → pronto). Ninguém deve ficar preso numa etapa por falta de um documento que só vai chegar depois.
2. **Regra de negócio centralizada.** A matriz de documentos e as regras de crítica devem morar em **um único lugar no código** (uma função/config, não espalhada em vários `if`), para poder evoluir sem reescrever telas.
3. **Nada substitui a leitura do edital.** Toda saída do wizard (matriz sugerida, texto de declaração, checklist) é *ponto de partida* a ser conferido — igual ao aviso que o README já traz hoje. Isso deve continuar valendo e aparecer no wizard.
4. **Reaproveitar o que já existe.** O parser de PDF, o acervo documental, as certidões e o gerador de ZIP não devem ser reescritos — devem ser estendidos.
5. **Uma licitação, um pacote, um ZIP.** Continua o modelo atual (`licitacoes` 1:N `pacotes`, cada pacote gera um ZIP), só que o conteúdo do pacote passa a ser guiado pela matriz.

---

## 3. Taxonomia da Lei 14.133/2021 (o vocabulário que falta no sistema)

Hoje `modalidade` é texto livre. Ela precisa virar um conjunto fechado de valores, e precisa de "vizinhos" (tipo de objeto, forma de contratação direta, critério de julgamento etc.) para a matriz de documentos funcionar. Proposta de enums:

### 3.1 `modalidade_licitacao` (art. 28 a 32) — usada quando **há certame**

| Valor (enum) | Nome | Uso típico |
|---|---|---|
| `pregao` | Pregão (eletrônico/presencial) | Bens e serviços **comuns**, inclusive comuns de engenharia |
| `concorrencia` | Concorrência | Bens/serviços **não comuns**, obras e serviços especiais de engenharia |
| `concurso` | Concurso | Trabalho técnico, científico ou artístico, com prêmio ou remuneração |
| `leilao` | Leilão | Venda/alienação de bens |
| `dialogo_competitivo` | Diálogo Competitivo | Contratações de alta complexidade/inovação, sem solução de mercado padronizada |

### 3.2 `forma_contratacao_direta` — usada quando **não há certame** (contratação direta)

| Valor | Nome | Base legal |
|---|---|---|
| `dispensa` | Dispensa de licitação | Art. 75, incisos I a XVI |
| `inexigibilidade` | Inexigibilidade de licitação | Art. 74, incisos I a V (inviabilidade de competição) |

> No wizard, o primeiro garfo de decisão é: **"Há certame formal?"** → se sim, preenche `modalidade_licitacao`; se não, preenche `forma_contratacao_direta` (e, dentro dela, o inciso específico do art. 74 ou 75).

### 3.3 `procedimento_auxiliar` (art. 78) — opcional, complementar

`credenciamento`, `pre_qualificacao`, `procedimento_manifestacao_interesse`, `sistema_registro_precos` (SRP/ata de registro de preços — pode acoplar a pregão ou concorrência).

### 3.4 `tipo_objeto`

| Valor | Nome |
|---|---|
| `bens_comuns` | Compras de bens comuns |
| `servicos_comuns` | Serviços comuns (não engenharia) |
| `servicos_comuns_engenharia` | Serviços comuns de engenharia |
| `obras` | Obras |
| `servicos_especiais_engenharia` | Serviços especiais/não comuns de engenharia |
| `servicos_especiais_intelectuais` | Serviços técnicos especializados de natureza predominantemente intelectual |
| `locacao_imoveis` | Locação de imóveis |
| `alienacao_bens` | Alienação de bens (uso típico com `leilao`) |

### 3.5 Outros atributos estruturados que valem a pena capturar

- `criterio_julgamento` (art. 33): `menor_preco`, `maior_desconto`, `melhor_tecnica_conteudo_artistico`, `tecnica_e_preco`, `maior_lance` (leilão), `maior_retorno_economico`.
- `modo_disputa` (art. 56): `aberto`, `fechado`, `aberto_fechado`, `fechado_aberto`.
- `regime_execucao` (art. 6º, XXV, e art. 46 — relevante para obras/engenharia): `empreitada_preco_unitario`, `empreitada_preco_global`, `empreitada_integral`, `contratacao_tarefa`, `contratacao_integrada`, `contratacao_semi_integrada`, `fornecimento_prestacao_associado`.
- `exclusividade_me_epp`: `sim` (exclusivo ME/EPP), `cota` (parte do objeto reservada), `nao` — tratamento diferenciado da LC 123/2006, recepcionado pela Lei 14.133/2021.
- `valor_estimado` (numeric) — usado para: (i) sugerir dispensa quando abaixo do limite legal, (ii) calcular exigência de garantia de proposta (art. 58, até 1%), (iii) calcular teto de patrimônio líquido/capital social mínimo (art. 69, até 10% do valor estimado).

### 3.6 Valores de referência 2026 (Decreto nº 12.807/2025) para a crítica de dispensa por valor

| Hipótese | Valor-limite 2026 |
|---|---|
| Art. 75, I — Obras e serviços de engenharia | R$ 130.984,20 |
| Art. 75, II — Compras e demais serviços | R$ 65.492,11 |
| Art. 75, §7º — Peças/manutenção de veículos | R$ 10.478,74 |
| Art. 95, §2º — Contrato verbal (exceção) | R$ 13.098,41 |
| Serviços técnicos especializados (teto p/ inexigibilidade por notória especialização, referência) | R$ 392.952,63 |

Esses valores mudam por decreto todo ano — **não deixe hardcoded sem data de revisão**; guarde numa tabela de configuração com vigência (ver Seção 8.4), não direto no código.

---

## 4. Fluxo do wizard — telas e campos

Substituir o modal único `notice` por um wizard de 7 passos, mantendo (e reaproveitando) a leitura de PDF como atalho para pré-preencher os passos 1 a 3.

### Passo 0 — Origem
"Você tem o edital em PDF ou vai preencher manualmente?"
- Se PDF → roda o `extractPdf`/`analyzeNoticeText` já existente e usa o resultado como sugestão inicial para os passos seguintes (tudo editável).
- Se manual → segue direto para o Passo 1 em branco.

### Passo 1 — Identificação e empresa participante
Campos: empresa (obrigatório, já existe), número/identificação do processo, órgão/entidade, UASG/código no PNCP (se houver), objeto (texto), data e hora de abertura/sessão, link do processo no PNCP/portal, edital em PDF (upload, já existe).

**Crítica neste passo:** data de abertura não pode ser no passado; se faltar menos de 3 dias úteis para a abertura, exibir alerta visual desde já (vai acompanhar o usuário até o fim do wizard).

### Passo 2 — Classificação (o coração da mudança)
Campos: há certame? (sim/não) → se sim, `modalidade_licitacao`; se não, `forma_contratacao_direta` + inciso legal específico (lista do art. 74 ou 75, com o texto do inciso à mostra para o usuário confirmar o enquadramento). Depois: `tipo_objeto`, `criterio_julgamento`, `modo_disputa` (se pregão/concorrência), `regime_execucao` (se obra/engenharia), `exclusividade_me_epp`, `valor_estimado`, procedimento auxiliar (SRP, credenciamento, pré-qualificação), se aplicável.

**Crítica neste passo:** se `forma_contratacao_direta = dispensa` por valor (incisos I/II) e `valor_estimado` ultrapassar o limite da Seção 3.6 vigente, alertar "valor acima do teto de dispensa por valor — confirme o enquadramento legal usado no processo, pode não ser por valor". Se `tipo_objeto = obras` e `modalidade_licitacao = pregao`, alertar (pregão é para bens/serviços comuns; obra deve ser concorrência, salvo serviço comum de engenharia).

> **É a partir deste passo que a Matriz de Documentos (Seção 5) é calculada automaticamente** e populada nos passos 3 a 6 como checklist pré-marcado, sempre editável.

### Passo 3 — Habilitação jurídica e fiscal/social/trabalhista
Lista gerada pela matriz (contrato social, CNDs, FGTS, CNDT, declarações etc.), cada item já tentando casar automaticamente com o acervo da empresa (reaproveita `newestCertificate`/`requirementCertificateType`, generalizado para todas as categorias, não só certidões). Cada linha mostra: documento exigido → documento encontrado (ou "não encontrado") → validade → status (ok / vencido / ausente / não se aplica, com justificativa).

### Passo 4 — Qualificação econômico-financeira
Só aparece com campos habilitados se a matriz indicar exigência (normalmente concorrência, obras, contratos de maior valor). Campos: balanço patrimonial vinculado (reaproveita `balancos`), índices contábeis (LG, LC, SG) exigidos pelo edital e valor apurado, patrimônio líquido/capital social mínimo exigido (até 10% do valor estimado) x valor da empresa, certidão negativa de falência/recuperação judicial, garantia de proposta (se exigida, até 1% do valor estimado).

**Crítica:** patrimônio líquido informado < exigido → pendência crítica. Balanço de exercício desatualizado → alerta.

### Passo 5 — Qualificação técnica
Campos: registro/inscrição em conselho profissional (CREA/CAU/CRC/outros), atestados de capacidade técnica vinculados (novo tipo de documento no acervo — Seção 8), responsável técnico e vínculo, ART/RRT (obras/engenharia), declaração de vistoria (ou de dispensa dela).

**Crítica:** soma das quantidades/parcelas dos atestados vinculados abaixo do percentual mínimo da parcela de maior relevância (o percentual é informado pelo usuário a partir do edital, o sistema só soma e compara).

### Passo 6 — Proposta e declarações
Reaproveita o que já existe hoje (itens, requisitos da proposta, declarações), mas a lista de declarações passa a vir da matriz (por modalidade/forma), não só do texto extraído do PDF.

### Passo 7 — Revisão e crítica final
Painel único consolidando os passos 3 a 6: contagem de itens "ok" / "vencido" / "ausente" / "não se aplica", prazo até a abertura, botão "Gerar pacote ZIP" habilitado mesmo com pendências (mas com aviso destacado, para não travar o usuário) e um resumo textual pronto para copiar (equivalente ao `00-checklist.txt` atual, só que completo).

---

## 5. Matriz de documentos de habilitação

Base legal: Capítulo VI da Lei 14.133/2021 — habilitação jurídica (art. 66), técnica (art. 67), fiscal/social/trabalhista (art. 68), econômico-financeira (art. 69). A matriz cruza **modalidade/forma** × **tipo de objeto** com os quatro blocos de habilitação + proposta.

### 5.1 Bloco comum a (quase) todos os casos — Habilitação jurídica (art. 66) e fiscal/social/trabalhista (art. 68)

| Documento | Obrigatório em | Observação |
|---|---|---|
| Ato constitutivo/contrato social consolidado e alterações (Junta Comercial) | Todos | Já existe como acervo; falta um `tipo` específico |
| Prova de inscrição no CNPJ | Todos | — |
| Certidão conjunta Federal/PGFN (tributos federais e dívida ativa da União) | Todos | Já mapeado hoje (`requirementCertificateType`) |
| Certidão de Regularidade do FGTS (CRF) | Todos | Já mapeado |
| Certidão Negativa de Débitos Trabalhistas (CNDT) | Todos | Já mapeado |
| Certidão de regularidade Fazenda Estadual | Todos, quando a atividade tiver incidência estadual | Já mapeado |
| Certidão de regularidade Fazenda Municipal | Todos, quando a atividade tiver incidência municipal | Já mapeado |
| Declaração de cumprimento do art. 7º, XXXIII, CF | Todos | Já existe geração de texto |
| Declaração de inexistência de fato impeditivo | Todos | Já existe |
| Declaração de elaboração independente da proposta | Pregão, concorrência | Já existe |
| Declaração de enquadramento ME/EPP | Quando `exclusividade_me_epp ≠ nao` | Novo |

### 5.2 Bloco econômico-financeiro (art. 69) — normalmente concorrência, obras, contratos de maior valor; opcional em pregão de baixo valor

| Documento | Quando exigir |
|---|---|
| Balanço patrimonial + demonstrações contábeis do último exercício | `tipo_objeto` = obras, serviços especiais de engenharia, ou `valor_estimado` alto |
| Certidão negativa de falência/recuperação judicial | Idem acima |
| Comprovação de patrimônio líquido/capital social mínimo (até 10% do valor estimado) | Idem acima |
| Índices contábeis (LG, LC, SG) conforme fórmula do edital | Idem acima |
| Garantia de proposta (até 1% do valor estimado, art. 58) | Quando o edital exigir, comum em obras de maior vulto |

### 5.3 Bloco técnico (art. 67) — varia fortemente por objeto

| `tipo_objeto` | Documentos técnicos típicos |
|---|---|
| `bens_comuns` | Em geral dispensável; eventual amostra/protótipo, certificação técnica do produto (INMETRO, ANVISA etc., conforme o item) |
| `servicos_comuns` | Atestado de capacidade técnica compatível; eventual registro em conselho profissional |
| `servicos_comuns_engenharia` | Registro da empresa no CREA/CAU; atestado técnico; ART do atestado |
| `obras` | Registro da empresa no CREA/CAU; atestado de capacidade técnico-operacional e técnico-profissional; ART/RRT; comprovação de vínculo do RT; declaração de vistoria (ou de dispensa); equipe técnica mínima |
| `servicos_especiais_engenharia` | Igual a obras + metodologia executiva/plano de trabalho quando contratação integrada/semi-integrada |
| `servicos_especiais_intelectuais` | Currículo/portfólio da equipe, comprovação de notória especialização, atestados por serviço similar |
| `locacao_imoveis` | Matrícula do imóvel, habite-se, laudo de vistoria/avaliação |

### 5.4 Bloco proposta — varia por modalidade/critério de julgamento

- `menor_preco` / `maior_desconto`: planilha de itens com preço unitário/total (já existe), declaração de preços com tributos/frete/encargos inclusos, prazo de validade da proposta.
- `tecnica_e_preco` / `melhor_tecnica`: além do acima, proposta técnica separada, com metodologia, cronograma, plano de trabalho, pontuação técnica auto-declarada para conferência.
- Obras: planilha orçamentária detalhada com BDI, cronograma físico-financeiro, composição de encargos sociais e de custos unitários.

### 5.5 Especificidades por modalidade/forma (resumo executivo)

| Modalidade/forma | O que muda em relação ao bloco comum |
|---|---|
| **Pregão** | Habilitação enxuta (jurídica + fiscal); técnica/econômico-financeira só se o objeto justificar; fase de lances antes da habilitação (proposta reenviada após lance vencedor) |
| **Concorrência** | Habilitação completa (jurídica + fiscal + técnica + econômico-financeira quase sempre exigida); se obra/engenharia, todo o bloco 5.3 "obras" entra |
| **Concurso** | Foco quase exclusivo em qualificação técnica/artística do autor/equipe; habilitação jurídica simplificada; sem qualificação econômico-financeira na maioria dos casos |
| **Leilão** | Fluxo do **arrematante**, não do fornecedor: documento de identificação, comprovação de capacidade de pagamento, garantia de lance — foge do fluxo padrão de "empresa fornecedora"; tratar como caso à parte no wizard (Seção 9, fase 5) |
| **Diálogo competitivo** | Pré-seleção por qualificação técnica antes das rodadas de diálogo; habilitação como concorrência; registrar as rodadas/atas como documentos do processo |
| **Dispensa (art. 75)** | Sem certame formal, mas exige processo de contratação direta: DFD, pesquisa de preços/cotações, justificativa do enquadramento no inciso, justificativa de preço, autorização da autoridade; habilitação jurídica/fiscal ainda exigível (confirmar no aviso/termo de referência do órgão, pois cada ente pode reduzir exigências por regulamento próprio) |
| **Inexigibilidade (art. 74)** | Idem dispensa, mas a justificativa central é a **inviabilidade de competição**: documento de exclusividade, atestado de notória especialização, ou natureza do objeto (artista consagrado, credenciamento) |

> **Nota de responsabilidade:** esta matriz é um guia de boas práticas construído sobre o texto da lei; **cada edital pode acrescentar ou flexibilizar exigências** dentro dos limites legais. O sistema deve sempre deixar claro que a matriz é sugestão de partida, com o item sempre editável e a checagem final do edital original obrigatória — isso já é um princípio do sistema atual (ver `README.md`, seção "Regra operacional") e deve continuar valendo no wizard.

---

## 6. Motor de crítica — regras de validação

Pensar como uma função pura `criticarProcesso(licitacao, empresa, documentosVinculados) → { pendencias[], alertas[], status }`, chamada toda vez que algo muda em qualquer passo do wizard (não só no final). Categorias de regra:

### 6.1 Vigência
- Toda certidão/documento com validade deve ter `validade >= data_abertura`. Se não tiver, pendência **crítica** ("vencerá antes da sessão").
- Se `validade` estiver a menos de 10 dias úteis da abertura, alerta amarelo ("revalidar por segurança").
- Balanço deve ser do exercício mais recente já encerrado (ou dos 2 últimos, se o edital pedir 2) — alerta se estiver desatualizado.

### 6.2 Completude
- Todo item obrigatório da matriz (calculada no Passo 2) precisa estar com status `ok` ou `nao_aplicavel` (com justificativa preenchida) para o processo virar "pronto".
- Itens da planilha de proposta devem cobrir 100% dos itens do edital (comparação de quantidade de linhas, se a planilha do órgão foi importada via `importItemsSpreadsheet`, que já existe).

### 6.3 Consistência
- CNPJ do documento anexado (quando extraível do nome/metadado) deve bater com o CNPJ da empresa selecionada.
- Patrimônio líquido/capital social informado × exigência (até 10% do valor estimado) — pendência crítica se abaixo.
- Soma das quantidades dos atestados técnicos × percentual mínimo da parcela de maior relevância informado pelo usuário.
- Se `exclusividade_me_epp = sim` e a empresa não tiver declaração/enquadramento ME/EPP cadastrado, pendência crítica.
- Se `modalidade_licitacao = pregao` e `tipo_objeto = obras`, alerta de inconsistência (ver 4, Passo 2).
- Se `forma_contratacao_direta = dispensa` por valor e `valor_estimado` > limite vigente (tabela 3.6), alerta para revisar o enquadramento.

### 6.4 Elegibilidade (checagem assistida, não automática no MVP)
- Botão/lembrete para consultar CEIS, CNEP, CADICON/TCU e a lista de inidôneos do órgão antes do envio — o sistema **não** consulta essas bases automaticamente na primeira versão (não há integração), só orienta e guarda o link.
- Declaração de inexistência de conflito de interesse (servidor do órgão como sócio/administrador) exigida sempre.

### 6.5 Prazo e status do processo
- `status` do processo passa a ter 4 estados (em vez de só o `status` do pacote atual): `rascunho` (Passo 0-2 incompletos) → `em_conferencia` (Passos 3-6 em andamento) → `pronto` (0 pendências críticas) → `enviado`/`arquivado` (mantém os já existentes em `pacotes.status`).
- Contagem regressiva até a abertura visível em todas as telas do wizard a partir do Passo 1.

O motor de crítica é o que transforma o wizard de "formulário bonito" em "assistente que realmente evita erro" — é o diferencial pedido.

---

## 7. Estrutura do pacote ZIP final

Hoje o ZIP já sai assim (ver `downloadProcessPackage`):

```
<processo>-<empresa>.zip
├── 00-checklist.txt
├── <categoria>/<documento>.pdf        (um por documento com path, por categoria genérica)
├── 02-proposta/proposta-de-precos.doc
├── 02-proposta/planilha-de-itens.xlsx
└── 03-declaracoes/declaracoes.doc
```

Proposta de estrutura nova, alinhada à matriz e variável por modalidade (as pastas que não se aplicam simplesmente não são criadas):

```
<processo>-<empresa>.zip
├── 00-checklist-completo.pdf (ou .txt)   ← resumo de status por item da matriz, com pendências em destaque
├── 01-habilitacao-juridica/
├── 02-habilitacao-fiscal-trabalhista/
├── 03-qualificacao-economico-financeira/      ← só existe se a matriz exigir (concorrência/obras/valor alto)
├── 04-qualificacao-tecnica/                   ← só existe se a matriz exigir
├── 05-proposta/
│   ├── proposta-de-precos.doc
│   ├── planilha-de-itens.xlsx
│   └── planilha-orcamentaria.xlsx             ← só obras
├── 06-declaracoes/declaracoes.doc
├── 07-processo-contratacao-direta/            ← só existe se dispensa/inexigibilidade (DFD, pesquisa de preço, justificativas)
└── 99-edital-e-anexos/
```

O `00-checklist-completo` passa a listar **todos** os itens da matriz (não só as certidões), com status `[INCLUÍDO]` / `[PENDENTE]` / `[NÃO SE APLICA — justificativa]`, igual ao padrão que já existe hoje, só que completo.

---

## 8. Modelo de dados proposto (extensão do `schema.sql` atual)

Não precisa recriar nada — é tudo `alter table ... add column if not exists` e novas tabelas, no mesmo padrão idempotente que o projeto já usa (ver `atualizacao_documentos_processos.sql` como referência de estilo).

### 8.1 Extensão de `public.licitacoes`

```sql
alter table public.licitacoes add column if not exists tem_certame boolean not null default true;
alter table public.licitacoes add column if not exists modalidade_padrao text
  check (modalidade_padrao in ('pregao','concorrencia','concurso','leilao','dialogo_competitivo'));
alter table public.licitacoes add column if not exists forma_contratacao_direta text
  check (forma_contratacao_direta in ('dispensa','inexigibilidade'));
alter table public.licitacoes add column if not exists fundamento_legal text; -- ex.: "art. 75, II"
alter table public.licitacoes add column if not exists tipo_objeto text
  check (tipo_objeto in ('bens_comuns','servicos_comuns','servicos_comuns_engenharia','obras',
    'servicos_especiais_engenharia','servicos_especiais_intelectuais','locacao_imoveis','alienacao_bens'));
alter table public.licitacoes add column if not exists criterio_julgamento text;
alter table public.licitacoes add column if not exists modo_disputa text;
alter table public.licitacoes add column if not exists regime_execucao text;
alter table public.licitacoes add column if not exists exclusividade_me_epp text
  check (exclusividade_me_epp in ('sim','cota','nao')) default 'nao';
alter table public.licitacoes add column if not exists valor_estimado numeric(18,2);
alter table public.licitacoes add column if not exists procedimento_auxiliar text;
alter table public.licitacoes add column if not exists status_processo text
  check (status_processo in ('rascunho','em_conferencia','pronto','enviado','arquivado')) default 'rascunho';
```

### 8.2 Nova tabela `public.licitacao_checklist_itens` (o checklist granular por processo, substitui o cálculo só-em-memória)

```sql
create table if not exists public.licitacao_checklist_itens (
  id uuid primary key default gen_random_uuid(),
  licitacao_id uuid not null references public.licitacoes(id) on delete cascade,
  bloco text not null check (bloco in ('juridica','fiscal_trabalhista','economico_financeira','tecnica','proposta','declaracoes','processo_contratacao_direta')),
  titulo text not null,
  obrigatorio boolean not null default true,
  aplicavel boolean not null default true,
  justificativa_nao_aplicavel text,
  documento_ref_tabela text,   -- 'certidoes' | 'documentos_empresa' | 'balancos'
  documento_ref_id uuid,
  status text not null default 'pendente' check (status in ('ok','vencido','ausente','pendente','nao_aplicavel')),
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_checklist_licitacao on public.licitacao_checklist_itens(licitacao_id);
```

RLS: mesma política das demais tabelas filhas de `licitacoes` (herda `empresa_id` via join, ou duplica `empresa_id` na tabela para simplificar a policy — recomendo duplicar `empresa_id` para manter o mesmo padrão simples de RLS que o resto do schema usa).

### 8.3 Novo `tipo` no acervo (`documentos_empresa.categoria`) para suportar habilitação técnica/econômica

Hoje `documentos_empresa.categoria`/`tipo` já são texto livre — não precisa alterar schema, só **padronizar os valores aceitos na UI**: acrescentar as categorias `Atestados técnicos`, `Registro profissional (CREA/CAU/CRC)`, `ART/RRT`, `Documentos societários` como opções no formulário de upload do acervo, reaproveitando a tabela existente.

### 8.4 Tabela de configuração de valores legais vigentes (evita hardcode de valor de dispensa)

```sql
create table if not exists public.parametros_legais (
  chave text primary key,             -- ex.: 'dispensa_art75_I', 'dispensa_art75_II'
  valor numeric(18,2) not null,
  vigencia_inicio date not null,
  fonte text,                          -- ex.: 'Decreto 12.807/2025'
  atualizado_em timestamptz not null default now()
);
```

Popular com os valores da Seção 3.6 e revisar uma vez por ano (ou quando sair novo decreto).

### 8.5 A matriz de documentos em si: código, não banco

A matriz (Seção 5) deve ficar como **configuração declarativa no frontend** (um objeto JS, no mesmo espírito de `issuerLinks`/`certificateOptions` que já existem em `app.js`), não numa tabela — ela muda por lógica de regras (modalidade × objeto × valor), não por CRUD do usuário. Uma função `calcularMatrizDocumentos(licitacao)` lê esse objeto de configuração e devolve a lista de itens a inserir em `licitacao_checklist_itens` quando o Passo 2 do wizard é confirmado (e permite recalcular se a classificação mudar depois).

---

## 9. Plano de implementação incremental

Pensado para ser executado em fases pequenas e testáveis, sem quebrar o que já funciona — importante porque o sistema está em produção.

**Fase 1 — Taxonomia e schema.** Rodar as migrações da Seção 8 (idempotentes, como o padrão do projeto). Adicionar os novos campos ao formulário de edital (ainda como formulário único, sem virar wizard ainda) só para começar a capturar `modalidade_padrao`, `tipo_objeto`, `forma_contratacao_direta`, `valor_estimado`. Baixo risco, alto valor: já habilita relatórios/filtros por modalidade.

**Fase 2 — Motor de matriz + checklist granular.** Implementar `calcularMatrizDocumentos()` e a gravação em `licitacao_checklist_itens`. Ainda sem UI de wizard: pode aparecer como uma lista nova na tela do processo, substituindo o cálculo ad-hoc que hoje mora dentro de `createProcessPackage`.

**Fase 3 — Quebrar o modal em wizard de fato.** Trocar `openModal('notice')` por um componente de passos (Passos 0 a 7 da Seção 4), reaproveitando os campos que já existem e inserindo os novos. O parser de PDF (`extractPdf`) continua alimentando o Passo 0/1 exatamente como hoje.

**Fase 4 — Motor de crítica completo (Seção 6).** Regras de vigência já existem parcialmente (`newestCertificate` compara validade); generalizar para todos os blocos, adicionar as regras de consistência e completude, e o painel de revisão final (Passo 7).

**Fase 5 — ZIP por modalidade.** Adaptar `downloadProcessPackage` para montar as pastas condicionalmente (Seção 7), puxando de `licitacao_checklist_itens` em vez de só de `pacotes.documentos`. Tratar `leilao` como fluxo à parte (Seção 5.5), sem forçá-lo na mesma matriz de "fornecedor".

**Fase 6 — Refinos.** Tabela `parametros_legais` com atualização anual; alertas de prazo (contagem regressiva) na lista de processos, não só dentro do wizard; exportação do checklist consolidado em PDF (hoje é `.txt`).

Cada fase é independente o suficiente para ser um PR separado — é o roteiro que a IA de implementação deve seguir, nessa ordem, para não tentar fazer tudo de uma vez num sistema em produção.

---

## 10. Apêndice A — Contexto técnico do repositório atual

Para quem for gerar código a partir deste documento sem acesso ao GitHub:

**Stack:** frontend é um SPA em **JavaScript vanilla sem build step** (`public/app.js`, `public/index.html`, `public/styles.css`), servido como site estático pelo **Cloudflare Workers/Pages** (`wrangler.jsonc`, `worker.js`; `server.js` é só um servidor local para rodar com `npm start`). Não há bundler, não há framework — tudo é DOM manipulado diretamente com um helper `$()` e strings de template literal para HTML.

**Backend:** **Supabase** faz tudo — Postgres (schema em `supabase/schema.sql`), Auth (login/senha), Storage (bucket privado `documentos`) e RLS (Row Level Security) para separar dados por empresa. O frontend fala **diretamente** com o Supabase via `client.from('tabela')...` (não há API própria/backend custom). A chave usada no browser é a chave publicável (anon key), protegida por RLS — nunca a `service_role`.

**Dois perfis de acesso:** `admin_geral` (vê tudo) e `proprietario_empresa` (vê só a própria empresa), controlados pelas funções SQL `meu_perfil()`/`minha_empresa()` e replicados em toda policy RLS do schema.

**Tabelas relevantes hoje:** `empresas`, `perfis`, `certidoes`, `documentos_empresa` (acervo geral), `licitacoes` (o "edital"), `balancos`, `pacotes` (o processo/pacote de participação, com `documentos`/`proposta`/`declaracoes`/`itens` em `jsonb`).

**Convenções de código em `app.js`:**
- Estado global em `state.{companies,documents,certificates,balances,notices,packages,...}`, recarregado por `loadData()`.
- Nomes de campos em JS ficam em inglês/camelCase mesmo quando a coluna do banco é em português (`notice.opening` vem de `licitacoes.abertura`, `pkg.documents` vem de `pacotes.documentos`) — há um mapeamento dentro de `loadData()`.
- `esc()` escapa HTML antes de interpolar em template string (sempre usar, para não abrir XSS).
- `openModal(type)` monta o formulário certo por `type` (`company`, `certificate`, `notice`, `balance` via `openBalanceModal`); o submit genérico está em `$('#modal-form').addEventListener('submit', ...)`, com um `if (type === '...')` por tipo de registro.
- Bibliotecas de terceiro vêm por **CDN no `index.html`**, não npm: `JSZip` (gera o ZIP), `XLSX`/SheetJS (lê/gera planilhas), `pdfjsLib` (lê PDF no navegador).
- Documentos "Word" (`proposta-de-precos.doc`, `declaracoes.doc`) na verdade são **HTML servido com extensão `.doc`** (função `documentShell`) — o Word abre normalmente. Não é um `.docx` real; manter esse padrão simples é proposital (evita dependência de biblioteca de geração de OOXML no browser).
- `requirementCertificateType(requisito)` e `newestCertificate(empresaId, tipo, dataAlvo)` são as funções que hoje fazem o "match" entre um requisito em texto livre e o acervo de certidões — é o embrião do motor de crítica descrito na Seção 6, hoje limitado a certidões.
- `createProcessPackage()` monta o `pacotes` (grava no Supabase); `downloadProcessPackage(id)` é quem efetivamente baixa os arquivos do Storage e monta o ZIP no browser com `JSZip`.

**Migrações:** o projeto já segue o padrão de arquivo de migração incremental e idempotente (`supabase/atualizacao_documentos_processos.sql`, com `add column if not exists`, `create table if not exists`, `drop policy if exists` antes de recriar) — qualquer nova migração deve seguir esse mesmo estilo, num novo arquivo `supabase/atualizacao_wizard_licitacoes.sql`, para poder rodar com segurança em cima do banco já em produção.

---

## 11. Apêndice B — Fontes legais consultadas

- [A habilitação na Lei 14.133/2021 — Justen, Pereira, Oliveira e Talamini](https://justen.com.br/artigo_pdf/a-habilitacao-na-lei-14-133-2021/)
- [O que envolve a habilitação jurídica, técnica, fiscal, social, trabalhista e econômico-financeira na nova Lei — Blog da Zênite](https://zenite.blog.br/o-que-envolve-a-habilitacao-juridica-tecnica-fiscal-social-trabalhista-e-economico-financeira-na-nova-lei/)
- [As modalidades de licitação da Lei 14.133/2021 — Justen, Pereira, Oliveira e Talamini](https://justen.com.br/artigo_pdf/as-modalidades-de-licitacao-da-lei-14-133-2021/)
- [Valores de Licitação em 2026 — limites atualizados pelo Decreto nº 12.807/2025 — eLicitação](https://elicitacao.com.br/2026/01/15/valores-de-licitacao-em-2026/)
- [Art. 75 da Lei 14.133 — hipóteses de dispensa explicadas — Blog Lisix](https://blog.lisix.com.br/art-75-da-lei-14-133-todas-as-hipoteses-de-dispensa-explicadas)

---

## 12. Avisos

Este documento foi elaborado com apoio de IA, cruzando o texto da Lei 14.133/2021 com fontes jurídicas especializadas, para servir de **guia técnico de produto**, não como parecer jurídico. Antes de travar exigências como obrigatórias no sistema, vale uma revisão por quem responde juridicamente pela empresa — especialmente nos pontos de enquadramento em dispensa/inexigibilidade (art. 74 e 75) e nos valores da Seção 3.6, que mudam por decreto todo ano.
