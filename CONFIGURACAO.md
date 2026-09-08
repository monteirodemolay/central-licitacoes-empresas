# Ativação do LiciDoc

## 1. Criar a estrutura no Supabase

1. Abra o projeto `central-licitacoes-empresas` no Supabase.
2. Entre em **SQL Editor**.
3. Clique em **New query**.
4. Copie integralmente o conteúdo de `supabase/schema.sql`.
5. Clique em **Run** e confirme que não houve erro.

Esse script cria as tabelas, os índices, o bucket privado e todas as políticas de acesso.

Se a estrutura inicial já foi criada anteriormente, execute os arquivos de
atualização, na ordem, sem apagar os dados existentes:

1. `supabase/atualizacao_documentos_processos.sql` — acervo documental, balanços,
   campos de análise do edital, pacotes vinculados aos processos e, agora, a
   Central por Empresa e a lixeira de 30 dias;
2. `supabase/atualizacao_wizard_licitacoes.sql` — taxonomia da Lei 14.133/2021,
   checklist por processo, agenda de interesse e a tabela de parâmetros legais.

Os dois são idempotentes e podem ser executados novamente com segurança para
ativar atualizações posteriores. Sem o segundo arquivo, o assistente de
habilitação e a agenda avisam na tela que a migração ainda não foi aplicada.

### Revisão anual dos valores legais

A tabela `public.parametros_legais` guarda os limites de dispensa por valor com a
data de vigência e a fonte. Os valores atuais são os do Decreto nº 12.807/2025
(vigência 2026) e **mudam por decreto todo ano**: quando sair o decreto seguinte,
atualize a tabela pelo SQL Editor em vez de mexer no código.

```sql
update public.parametros_legais
   set valor = 000000.00, vigencia_inicio = '2027-01-01',
       fonte = 'Decreto nº 00.000/2026', atualizado_em = now()
 where chave = 'dispensa_art75_II';
```

## 2. Configurar os endereços de autenticação

Em **Authentication → URL Configuration**:

- **Site URL:** use provisoriamente a URL fornecida pelo Cloudflare Pages;
- **Redirect URLs:** adicione a mesma URL com `/**` ao final;
- ao usar domínio próprio, adicione também `https://seudominio.com/**`.

Em **Authentication → Providers → Email**, mantenha e-mail e senha habilitados. A confirmação de e-mail pode permanecer ativa.

## 3. Liberar a criação de acesso pela própria página

O cadastro público foi desativado. Em vez dele, a tela **Central do usuário**
(visível só para quem é `admin_geral`) tem um formulário que cria a conta
direto pelo sistema — sem precisar abrir o painel do Supabase toda vez. Isso
funciona através de um endpoint do próprio Worker (`/api/admin/create-user`,
em `worker.js`), que usa a **service role key** do Supabase para criar o
usuário e confirma antes que quem está chamando é mesmo um `admin_geral`
autenticado.

Para habilitar:

1. No painel do Supabase, vá em **Project Settings → API** e copie a chave
   **service_role** (nunca a `anon`/publishable — essa é a que já está em
   `public/config.js`).
2. No terminal, na raiz do projeto, rode:
   ```
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
   e cole a chave quando solicitado. (Alternativa: **Workers & Pages → seu
   projeto → Settings → Variables and Secrets**, adicionar como *Secret*.)
3. `SUPABASE_URL` já vem definida em `wrangler.jsonc` (`vars`); não precisa
   de segredo, é a mesma URL pública do projeto.

Essa chave nunca deve ir para o repositório nem para `public/config.js` — ela
dá acesso total ao banco, ignorando RLS. Sem ela configurada, o formulário de
criação de acesso mostra um erro e a criação volta a ser feita manualmente
pelo painel do Supabase (passo 4 abaixo).

## 4. Criar o primeiro acesso

O formulário da Central do usuário só aparece para quem já está logado como
`admin_geral` — então a primeiríssima conta precisa nascer no painel do
Supabase:

1. No painel do Supabase, vá em **Authentication → Users → Add user**.
2. Informe e-mail e senha e marque **Auto Confirm User**.
3. Acesse o endereço publicado do LiciDoc e entre com esse e-mail/senha.

A primeira conta criada recebe automaticamente o perfil `admin_geral`. Faça
isso antes de divulgar a URL.

## 5. Criar e autorizar os acessos seguintes

Com o passo 3 configurado, o próprio `admin_geral` cria as contas seguintes
sem sair do sistema:

1. Abra **Central do usuário**.
2. Preencha nome, e-mail e uma senha temporária no card "Criar novo acesso" —
   se já souber o papel da pessoa (Proprietário + empresa, ou Administrador
   geral), escolha ali mesmo; senão deixe "Aguardando liberação".
3. Compartilhe a senha temporária com a pessoa por um canal seguro; ela pode
   trocá-la depois em "Esqueci minha senha", na tela de login.
4. Para uma conta que ficou "Aguardando liberação" (criada assim ou via
   Supabase), volte à lista abaixo do formulário, escolha o papel e a
   empresa e clique em **Salvar**.
5. Para tirar o acesso de alguém, clique em **Revogar acesso** na linha da
   pessoa — ela volta para "Aguardando liberação" e perde o acesso aos dados
   na hora.

Sem o segredo do passo 3, pule a criação pelo formulário e cadastre a conta
direto no Supabase (passo 4) — o resto do fluxo (autorizar, revogar) continua
igual.

## 6. Publicar pelo Cloudflare Pages

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

A chave presente em `public/config.js` é a chave publicável do navegador e trabalha em conjunto com RLS. Nunca coloque no repositório a chave `sb_secret`, `service_role`, senha do banco ou token pessoal. A `service_role` usada pela criação de acesso (passo 3) só existe como *secret* do Worker — não fica em nenhum arquivo do projeto, não é enviada ao navegador, e o endpoint que a usa (`/api/admin/create-user`) confere a sessão de quem chama e recusa qualquer um que não seja `admin_geral`.
