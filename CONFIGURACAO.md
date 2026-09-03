# Ativação do LicitaDoc

## 1. Criar a estrutura no Supabase

1. Abra o projeto `central-licitacoes-empresas` no Supabase.
2. Entre em **SQL Editor**.
3. Clique em **New query**.
4. Copie integralmente o conteúdo de `supabase/schema.sql`.
5. Clique em **Run** e confirme que não houve erro.

Esse script cria as tabelas, os índices, o bucket privado e todas as políticas de acesso.

## 2. Configurar os endereços de autenticação

Em **Authentication → URL Configuration**:

- **Site URL:** use provisoriamente a URL fornecida pelo Cloudflare Pages;
- **Redirect URLs:** adicione a mesma URL com `/**` ao final;
- ao usar domínio próprio, adicione também `https://seudominio.com/**`.

Em **Authentication → Providers → Email**, mantenha e-mail e senha habilitados. A confirmação de e-mail pode permanecer ativa.

## 3. Criar o primeiro acesso

1. Acesse o endereço publicado.
2. Informe seu nome, e-mail e senha.
3. Clique em **Criar primeiro acesso**.
4. Confirme o e-mail, se solicitado.

A primeira conta criada recebe automaticamente o perfil `admin_geral`. Faça esse cadastro antes de divulgar a URL.

## 4. Autorizar um proprietário

1. O proprietário cria o acesso na mesma tela.
2. O acesso fica como `pendente` e não visualiza dados.
3. Cadastre a empresa no sistema.
4. Abra **Acessos**, selecione a empresa correta e clique em **Autorizar**.

O proprietário passa a acessar somente a empresa vinculada.

## 5. Publicar pelo Cloudflare Pages

1. Abra **Workers & Pages** no Cloudflare.
2. Selecione **Create application → Pages → Connect to Git**.
3. Escolha `monteirodemolay/central-licitacoes-empresas`.
4. Branch de produção: `main`.
5. Build command: deixe vazio.
6. Deploy command: `npx wrangler deploy`.
7. Mantenha **Protect with Cloudflare Access** desligado, pois o sistema já possui autenticação própria.
8. Clique em **Deploy** e aguarde a publicação.

O arquivo `wrangler.jsonc` já define a pasta `public`, o comportamento de aplicativo e os cabeçalhos de segurança.

## Segurança

A chave presente em `public/config.js` é a chave publicável do navegador e trabalha em conjunto com RLS. Nunca coloque no repositório a chave `sb_secret`, `service_role`, senha do banco ou token pessoal.
