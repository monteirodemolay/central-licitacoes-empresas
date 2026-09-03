# Segurança

Este é um repositório privado, mas documentos empresariais, certidões, editais com dados pessoais, certificados digitais, chaves, senhas e arquivos de ambiente não devem ser enviados ao Git.

## Regras

- Nunca versionar `.env`, bancos locais, uploads ou backups.
- Nunca armazenar senha de certificado digital no código.
- Revogar imediatamente qualquer segredo enviado por engano.
- Usar dados fictícios nos testes e nas demonstrações.
- Manter confirmação humana para assinatura, envio de proposta e acesso a portais oficiais.
- Manter somente os perfis `admin_geral` e `proprietario_empresa`.
- Restringir o proprietário aos documentos, editais e propostas vinculados ao seu `empresaId`.
- Aplicar a restrição nas regras do Firestore e do Storage, e não somente na interface.
- Manter uma lista mínima e explícita de contas autorizadas no Firebase.

## Estado do MVP

Esta versão armazena registros no navegador e não deve ser usada como cofre documental definitivo. A versão de produção terá autenticação, banco de dados e armazenamento criptografado.
