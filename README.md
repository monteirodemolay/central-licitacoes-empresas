# LiciDoc — Controle de Licitações

Sistema administrativo enxuto para controlar empresas, documentos e participações em licitações.

## Escopo definido

- uso pelo administrador geral e pelo proprietário de cada empresa;
- o administrador geral acessa todas as empresas, documentos e licitações;
- cada proprietário acessa integralmente apenas a própria empresa;
- não existem outros perfis, cargos, departamentos ou fluxos de aprovação;
- o cadastro de acesso será feito dentro da própria empresa, sem módulo complexo de usuários;
- autenticação serve somente para impedir acesso de pessoas não autorizadas;
- prioridade para rapidez, conferência documental e preparação da participação.

Fluxo principal: cadastrar empresa → manter certidões → cadastrar ou importar edital no assistente → classificar o processo → conferir a documentação exigível → acompanhar o que falta pela agenda → gerar pacote.

## O que já funciona

- cadastro de múltiplas empresas;
- acervo documental como checklist do catálogo inteiro, e não uma pilha de arquivo solto: todo tipo aparece, tenha ou não arquivo — o que vale hoje em destaque, o histórico recolhido, e "Ausente" para o que ainda falta;
- catálogo fechado de tipos, cada um com a regra que decide a vigência — vale até a validade, o mais recente substitui os anteriores, ou todos somam; registro de conselho profissional (CREA/CAU/CRC) separado entre empresa (pessoa jurídica) e responsável técnico (pessoa física, com o nome de cada profissional), porque não são o mesmo documento;
- seletor "vincular arquivo já enviado" em cada linha do acervo, para apontar qual dos arquivos já cadastrados é aquele tipo — com pré-visualização do PDF ou imagem antes de confirmar — e, se nenhum servir, cadastrar um novo já com o tipo certo;
- visualizador de PDF/imagem embutido também na edição de certidões e documentos, para corrigir a classificação vendo o arquivo, não só o nome dele;
- campo do tipo travado no catálogo nos formulários de edição — nada de texto livre divergindo da classificação real, que era como declaração entrava como ato constitutivo;
- veredito objetivo de prontidão por empresa (apto / apto com ressalva / não apto), calculado sobre a base documental mínima, com o que falta e o que vence em até 30 dias;
- painel de regularidade do dia na Visão geral, por empresa: as certidões fiscais que praticamente todo edital exige, com a validade da vigente ou "Ausente"/"Vencida" e um atalho para mandar a atualizada na hora; o mesmo atalho também sai clicando direto no selo "Vencida"/"Urgente" dos alertas de validade;
- prontidão projetada para uma data futura — não só hoje —, usada na tela do edital para responder objetivamente "a empresa vai ter documento apto na data da sessão?";
- ação de organizar o acervo, que classifica no catálogo o que foi importado antes de existir critério;
- edição de certidões, documentos e balanços já cadastrados, inclusive para corrigir a classificação divergente ou reconhecida errado, com troca de arquivo opcional;
- revisão de classificação em lote, para corrigir de uma vez várias certidões e documentos não reconhecidos ou divergentes, com tipo e validade editáveis direto na linha;
- revisão documento por documento, para conferir com calma um registro de cada vez — abre o arquivo, decide o tipo certo e confirma, com lista lateral para pular direto para qualquer outro;
- cadastro de documento de qualquer tipo do catálogo (societário, técnico, licença...), não só certidão ou balanço, que decide sozinho se vai para o controle de certidões ou para o acervo comum;
- importação de pastas baixadas do Dropbox em ZIP ou já descompactadas, com leitura das subpastas;
- suporte a ZIPs de até 1 GB e até 1.500 documentos por lote;
- identificação de duplicidades por hash antes do envio;
- indicação do arquivo original correspondente e relatório CSV de repetidos;
- controle de certidões e validade;
- importação simultânea de certidões com classificação e leitura de datas;
- organização privada por empresa, tipo, ano e histórico de versões;
- classificação automática em regular, urgente e vencida;
- painel inicial e central de revisão completa por empresa;
- links oficiais para Federal/PGFN, FGTS e CNDT;
- assistente de habilitação em 8 passos, com a taxonomia da Lei 14.133/2021 (modalidade, forma de contratação direta, tipo de objeto, critério de julgamento, regime de execução e tratamento ME/EPP);
- matriz automática dos documentos exigíveis por modalidade, tipo de objeto e valor (arts. 66 a 69);
- vinculação automática de cada exigência ao acervo, às certidões e aos balanços já cadastrados;
- crítica em tempo real de vigência, completude e consistência, com alerta de certidão que vence antes da sessão e de valor acima do teto de dispensa;
- envio de documento direto pela linha do checklist — no assistente e também na tela de detalhes do edital —, indo para o acervo da empresa e ficando vinculado ao item;
- item marcável como "não se aplica" com justificativa registrada;
- agenda de interesse por edital, com contagem regressiva, prioridade, responsável e percentual de documentação pronta;
- providências com prazo, geradas a partir das pendências do checklist e agrupadas em atrasadas, próximos 7 dias e mais adiante;
- cadastro de editais e requisitos;
- leitura local de editais em PDF, com extração de texto e análise preliminar;
- identificação assistida de objeto, órgão, modalidade, abertura e documentos exigidos;
- identificação de requisitos da proposta, declarações e itens do edital;
- tela própria de cada edital, com o checklist de habilitação agrupado por bloco e base legal, as providências em aberto, objeto, requisitos, declarações, itens e pacotes vinculados;
- importação de itens em XLS, XLSX ou CSV;
- controle de balanços por exercício e orientação preliminar de exigibilidade;
- pacotes vinculados a cada processo, preservando as versões utilizadas;
- geração de ZIP organizado por bloco de habilitação, criando somente as pastas exigidas para aquele processo;
- checklist consolidado em PDF, pronto para imprimir e levar para conferência, com a situação de cada item, a base legal de cada bloco e a contagem regressiva até a sessão;
- checklist completo no pacote, com `[INCLUÍDO]`, `[PENDENTE]`, `[VENCIDO PARA A SESSÃO]`, `[GERADO PELO SISTEMA]` e `[NÃO SE APLICA — justificativa]`;
- lixeira para todos os registros operacionais, com restauração, exclusão imediata e limpeza após 30 dias;
- exportação do banco local em JSON.

## Documentação de referência

A especificação funcional do assistente e o mockup navegável estão em
[`docs/wizard-licitacoes/`](docs/wizard-licitacoes/). O mockup é um HTML
independente: basta abrir no navegador.

## Executar

É necessário Node.js 18 ou superior.

```bash
npm start
```

Abra `http://127.0.0.1:4173`.

## Privacidade desta versão

Os cadastros ficam no Supabase PostgreSQL e os arquivos no bucket privado `documentos`. O acesso é protegido por autenticação e políticas RLS por empresa. Chaves administrativas não ficam no navegador.

O leitor de PDF executa no navegador. PDFs que contenham texto podem ser analisados sem upload. Documentos formados somente por imagens são sinalizados para futura leitura por OCR. A extração é preliminar e deve ser conferida no edital original.

## Infraestrutura

- GitHub: código-fonte;
- Cloudflare Workers: publicação do frontend estático;
- Supabase Auth: cadastro, login e recuperação de senha;
- Supabase PostgreSQL: empresas, certidões, licitações e acessos;
- Supabase Storage: PDFs em bucket privado;
- RLS: separação dos dados por empresa diretamente no banco.

Haverá somente dois perfis: administrador geral e proprietário da empresa. O administrador geral tem acesso global; o proprietário fica restrito à empresa vinculada. Consulte [CONFIGURACAO.md](CONFIGURACAO.md) para ativar o sistema.

## Próximas funcionalidades

1. OCR para PDFs digitalizados;
2. IA privada com citações por arquivo e página;
3. notificações de vencimento e de prazo da agenda por e-mail;
4. integração PNCP;
5. edição avançada da proposta antes da geração;
6. consulta assistida a CEIS, CNEP e CADICON antes do envio;
7. histórico de alterações e backup ampliado.

## Fora do escopo

- níveis adicionais de permissão;
- aprovação por setores;
- cadastro de departamentos;
- fluxo de assinatura entre usuários;
- portal de fornecedores ou clientes;
- comunicação interna;
- módulos administrativos sem relação direta com a licitação.

## Critério de arquivamento

O acervo não é uma pasta de arquivos: é uma lista de **tipos de documento**. Cada
arquivo aponta para um tipo do catálogo (`public/regras-licitacao.js`), e é o tipo
que diz como a vigência funciona:

| Regra | O que significa | Exemplos |
|---|---|---|
| `validade` | Vale até a data de validade | certidões fiscais (Federal/PGFN, FGTS, CNDT, estadual, municipal), alvará |
| `substituivel` | O mais recente substitui os anteriores | contrato social, cartão CNPJ, balanço |
| `acumulativo` | Todos continuam valendo juntos | atestados de capacidade técnica, ART/RRT, registro do responsável técnico no conselho profissional, documento de identificação do representante legal — a empresa pode ter mais de um profissional ou mais de um representante legal ao mesmo tempo, cada um com o próprio nome guardado no campo "Nome da pessoa" |

Dentro de um tipo acumulativo, o sistema escolhe o mais recente para
representar o grupo em destaque — mas isso é só um ponto de partida. O botão
**Arquivar**, em cada arquivo desse tipo, tira ele manualmente da disputa por
"vigente" sem apagar nada: útil quando o mais recente não é mais o que vale
de fato, como um responsável técnico mais novo que já não está mais na
empresa. **Reativar** desfaz.

Os tipos marcados como **base** são os que praticamente todo edital exige. É sobre
eles que o veredito de prontidão é calculado — a resposta objetiva de "posso
disputar hoje?", independente de um edital específico.

O registro em conselho profissional (CREA/CAU/CRC) é dois tipos, não um: o
**da empresa** (pessoa jurídica, um só, o mais recente vale) e o **de cada
responsável técnico** (pessoa física, todos somam — não faz sentido o CREA de
um engenheiro "substituir" o de outro). Confundir os dois foi um erro comum
antes dessa separação.

O Acervo mostra o catálogo inteiro, tipo por tipo — não só o que já tem
arquivo. Um tipo sem nenhum documento aparece como **Ausente**, com o mesmo
seletor de vínculo dos outros: é assim que dá para ver, de cara, tudo que
ainda falta enviar, sem precisar adivinhar o que existe.

Quem já tinha acervo importado antes do catálogo usa o botão **Organizar acervo**:
ele reclassifica o que está lá, separando, por exemplo, o contrato social das
alterações contratuais que antes ficavam ambos como "Documento societário".

Quando a leitura automática erra — e ela erra —, o botão **Editar** em cada
certidão, documento ou balanço abre os campos para correção, incluindo o tipo do
catálogo. A correção manual é definitiva: o "Organizar acervo" só preenche o que
ainda está sem classificação e nunca sobrescreve o que você ajustou.

Para corrigir muitas de uma vez — típico logo depois de importar uma pasta
grande do Dropbox —, o botão **Revisar classificação em lote** abre uma tabela
com todas as certidões e documentos (de uma empresa ou de todas), tipo e
validade editáveis direto na linha. Por padrão mostra só os **não
reconhecidos**; dá para trocar para "Todos", filtrar por empresa e buscar por
nome. Nada é gravado enquanto você mexe: as alterações ficam destacadas na
tabela e só vão para o banco quando você clica em **Salvar alterações**, tudo
de uma vez.

Para conferir com calma, um de cada vez — abrindo o arquivo, olhando o que é,
decidindo o tipo certo —, o botão **Revisar documento por documento** mostra
um registro por vez, com uma lista ao lado para pular direto para qualquer
outro. Confirma e grava na hora, sem perder o arquivo; sair sem confirmar uma
alteração pede confirmação antes de descartar.

Uma quarta via, direto na linha do tipo no Acervo: **Vincular arquivo já
enviado** abre um seletor com todos os documentos e certidões já cadastrados
na empresa, mostrando o nome do arquivo original e a classificação que cada
um tem hoje — inclusive quando está errada, como uma declaração que entrou
como ato constitutivo. Escolher um mostra a pré-visualização do PDF ou
imagem antes de confirmar; se nenhum arquivo já enviado for aquele tipo, um
link leva direto para cadastrar um novo, já com o tipo certo preenchido. É a
via inversa da revisão documento por documento: aqui se parte do tipo que
falta, não do arquivo que sobrou.

Editar um registro também mostra o arquivo ao lado do formulário — certidão
ou documento, PDF ou imagem — porque não dá para corrigir a classificação
direito sem ver o que está sendo classificado. O campo "Tipo" fica travado
no catálogo: para certidão é um select da lista fechada, para documento
segue automaticamente o "Tipo no catálogo" escolhido, sem texto livre para
divergir de novo.

Para incluir um documento que ainda não existe no acervo — de qualquer tipo do
catálogo, não só certidão ou balanço —, o botão **Cadastrar documento** pede a
empresa, o tipo exato e o arquivo. O sistema decide sozinho se aquele tipo vai
para o controle de certidões (com a validade que ele já cobra) ou para o
acervo comum.

## Regra operacional

Nenhuma análise automática substitui a conferência do edital, dos documentos originais, das assinaturas e da validade na data da sessão.

A matriz de documentos do assistente é um guia de partida construído sobre o
texto da Lei 14.133/2021: cada edital pode acrescentar ou flexibilizar exigências
dentro dos limites legais, e todo item permanece editável. Os limites de dispensa
por valor ficam em `public.parametros_legais`, com vigência e fonte, porque mudam
por decreto todo ano — veja [CONFIGURACAO.md](CONFIGURACAO.md).
