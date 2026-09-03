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

Fluxo principal: cadastrar empresa → manter certidões → cadastrar ou importar edital → conferir requisitos → elaborar proposta → gerar pacote.

## O que já funciona

- cadastro de múltiplas empresas;
- acervo documental geral separado por empresa e categoria;
- importação de pastas baixadas do Dropbox em ZIP ou já descompactadas, com leitura das subpastas;
- suporte a ZIPs de até 1 GB e até 1.500 documentos por lote;
- identificação de duplicidades por hash antes do envio;
- controle de certidões e validade;
- importação simultânea de certidões com classificação e leitura de datas;
- organização privada por empresa, tipo, ano e histórico de versões;
- classificação automática em regular, urgente e vencida;
- links oficiais para Federal/PGFN, FGTS e CNDT;
- cadastro de editais e requisitos;
- leitura local de editais em PDF, com extração de texto e análise preliminar;
- identificação assistida de objeto, órgão, modalidade, abertura e documentos exigidos;
- identificação de requisitos da proposta, declarações e itens do edital;
- importação de itens em XLS, XLSX ou CSV;
- controle de balanços por exercício e orientação preliminar de exigibilidade;
- pacotes vinculados a cada processo, preservando as versões utilizadas;
- geração de ZIP com checklist, documentos, proposta, declarações e planilha XLSX;
- exportação do banco local em JSON.

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
3. notificações de vencimento;
4. integração PNCP;
5. edição avançada da proposta antes da geração;
6. histórico de alterações e backup ampliado.

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
