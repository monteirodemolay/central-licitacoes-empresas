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

## Próxima etapa de produção

1. Firebase Authentication para o administrador geral e os proprietários;
2. Cloud Firestore com estrutura direta e regras que separam rigorosamente os dados por empresa;
3. Firebase Storage para documentos, com acesso autenticado e regras restritivas;
4. OCR e extração estruturada em fila;
5. IA privada com citações por arquivo e página;
6. notificações de vencimento;
7. integração PNCP;
8. geração de DOCX, XLSX e ZIP;
9. histórico essencial de alterações, backup e recuperação.

## Publicação futura

O frontend será preparado para publicação no GitHub Pages. O Firebase cuidará de autenticação, dados e documentos. Haverá somente dois perfis: administrador geral e proprietário da empresa. O administrador geral terá acesso global; o proprietário ficará restrito à empresa vinculada ao seu usuário. O repositório não deve conter dados reais, chaves administrativas, contas de serviço ou segredos. As regras do Firestore e do Storage deverão negar acesso por padrão e aplicar essa separação também no servidor, nunca apenas na interface.

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
