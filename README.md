# LicitaDoc — MVP privado

Primeira versão funcional de uma central privada de documentação empresarial para licitações.

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

1. Firebase Authentication com acesso inicialmente restrito ao proprietário;
2. Cloud Firestore com isolamento lógico por empresa e regras de segurança;
3. Firebase Storage para documentos, com acesso autenticado e regras restritivas;
4. OCR e extração estruturada em fila;
5. IA privada com citações por arquivo e página;
6. notificações de vencimento;
7. integração PNCP;
8. geração de DOCX, XLSX e ZIP;
9. trilha de auditoria, backup e recuperação.

## Publicação futura

O frontend será preparado para publicação no GitHub Pages. O Firebase cuidará de autenticação, dados e documentos. O repositório não deve conter dados reais, chaves administrativas, contas de serviço ou segredos. As regras do Firestore e do Storage deverão negar acesso por padrão e liberar somente usuários autorizados.

## Regra operacional

Nenhuma análise automática substitui a conferência do edital, dos documentos originais, das assinaturas e da validade na data da sessão.
