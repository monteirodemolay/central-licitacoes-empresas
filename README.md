# LicitaDoc — Controle de Licitações

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
- controle de certidões e validade;
- classificação automática em regular, urgente e vencida;
- links oficiais para Federal/PGFN, FGTS e CNDT;
- cadastro de editais e requisitos;
- leitura local de editais em PDF, com extração de texto e análise preliminar;
- identificação assistida de objeto, órgão, modalidade, abertura e documentos exigidos;
- conferência preliminar entre empresa, certidões e edital;
- exportação do banco local em JSON.

## Executar

É necessário Node.js 18 ou superior.

```bash
npm start
```

Abra `http://127.0.0.1:4173`.

## Privacidade desta versão

O MVP não possui backend e guarda os registros no `localStorage` do navegador. O campo de arquivo permite selecionar documentos para validar o fluxo, mas o arquivo não é transmitido nem persistido. Não use esta versão como repositório definitivo de documentos empresariais.

O leitor de PDF executa no navegador. PDFs que contenham texto podem ser analisados sem upload. Documentos formados somente por imagens são sinalizados para futura leitura por OCR. A extração é preliminar e deve ser conferida no edital original.

## Infraestrutura

- GitHub: código-fonte;
- Cloudflare Pages: publicação do frontend;
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
5. geração de DOCX, XLSX e ZIP;
6. histórico essencial e backup ampliado.

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
