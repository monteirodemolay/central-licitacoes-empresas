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
- acervo documental geral separado por empresa e categoria;
- importação de pastas baixadas do Dropbox em ZIP ou já descompactadas, com leitura das subpastas;
- suporte a ZIPs de até 1 GB e até 1.500 documentos por lote;
- identificação de duplicidades por hash antes do envio;
- indicação do arquivo original correspondente e relatório CSV de repetidos;
- controle de certidões e validade;
- importação simultânea de certidões com classificação e leitura de datas;
- organização privada por empresa, tipo, ano e histórico de versões;
- classificação automática em regular, urgente e vencida;
- links oficiais para Federal/PGFN, FGTS e CNDT;
- assistente de habilitação em 8 passos, com a taxonomia da Lei 14.133/2021 (modalidade, forma de contratação direta, tipo de objeto, critério de julgamento, regime de execução e tratamento ME/EPP);
- matriz automática dos documentos exigíveis por modalidade, tipo de objeto e valor (arts. 66 a 69);
- vinculação automática de cada exigência ao acervo, às certidões e aos balanços já cadastrados;
- crítica em tempo real de vigência, completude e consistência, com alerta de certidão que vence antes da sessão e de valor acima do teto de dispensa;
- envio de documento direto pela linha do checklist, indo para o acervo da empresa;
- item marcável como "não se aplica" com justificativa registrada;
- agenda de interesse por edital, com contagem regressiva, prioridade, responsável e percentual de documentação pronta;
- providências com prazo, geradas a partir das pendências do checklist e agrupadas em atrasadas, próximos 7 dias e mais adiante;
- cadastro de editais e requisitos;
- leitura local de editais em PDF, com extração de texto e análise preliminar;
- identificação assistida de objeto, órgão, modalidade, abertura e documentos exigidos;
- identificação de requisitos da proposta, declarações e itens do edital;
- importação de itens em XLS, XLSX ou CSV;
- controle de balanços por exercício e orientação preliminar de exigibilidade;
- pacotes vinculados a cada processo, preservando as versões utilizadas;
- geração de ZIP organizado por bloco de habilitação, criando somente as pastas exigidas para aquele processo;
- checklist consolidado em PDF, pronto para imprimir e levar para conferência, com a situação de cada item, a base legal de cada bloco e a contagem regressiva até a sessão;
- checklist completo no pacote, com `[INCLUÍDO]`, `[PENDENTE]`, `[VENCIDO PARA A SESSÃO]`, `[GERADO PELO SISTEMA]` e `[NÃO SE APLICA — justificativa]`;
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

## Regra operacional

Nenhuma análise automática substitui a conferência do edital, dos documentos originais, das assinaturas e da validade na data da sessão.

A matriz de documentos do assistente é um guia de partida construído sobre o
texto da Lei 14.133/2021: cada edital pode acrescentar ou flexibilizar exigências
dentro dos limites legais, e todo item permanece editável. Os limites de dispensa
por valor ficam em `public.parametros_legais`, com vigência e fonte, porque mudam
por decreto todo ano — veja [CONFIGURACAO.md](CONFIGURACAO.md).
