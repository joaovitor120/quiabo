# Painel do Quiabo — app para celular (PWA)

App instalável no celular com a cotação diária do quiabo extra na CEASA-ES (Grande Vitória), o histórico de preços desde 2021, lançamentos de entrada de quiabo, vendas e despesas, e o valor do quiabo disponível pelo preço da CEASA ou pelo seu preço.

Dois logins, **daniel** e **jorge**, cada um com a sua senha. Os dois veem e lançam os mesmos dados, e o que um lança aparece no celular do outro na hora.

## O que tem nesta pasta

| Pasta / arquivo | Para que serve |
|---|---|
| `docs/` | O app em si (é o que vai para o ar no GitHub Pages) |
| `docs/config.js` | Onde você cola o endereço e a chave pública do Supabase |
| `supabase/01_estrutura.sql` | Cria as tabelas e a regra de acesso (só os usuários daniel e jorge leem e gravam) |
| `supabase/02_historico_precos.sql` | Carrega 1.199 cotações do quiabo, de ago/2021 até 22/10/2026 |
| `.github/workflows/cotacao.yml` | Busca a cotação na CEASA-ES de segunda a sábado, às 18h47 |
| `scripts/atualizar_cotacao.py` | O programa que a busca automática roda |

Custo: zero. Supabase e GitHub têm planos gratuitos que sobram para isso.

---

## Passo 1 — Banco de dados (Supabase), uns 10 minutos

1. Crie uma conta em **supabase.com** e um projeto novo. Em *Region*, escolha **South America (São Paulo)**. Guarde a senha do banco que ele pedir (não é a senha do app).
2. No menu da esquerda, abra **SQL Editor**, cole todo o conteúdo de `supabase/01_estrutura.sql` e clique em **Run**.
3. Faça o mesmo com `supabase/02_historico_precos.sql`.
4. Vá em **Authentication → Sign In / Providers → Email** e:
   - desligue **Allow new users to sign up** (ninguém mais consegue criar conta);
   - confira **Minimum password length**: o Supabase não aceita menos de 6 caracteres.
5. Vá em **Authentication → Users → Add user → Create new user**, uma vez para cada sócio:
   - Email: `daniel@painel-quiabo.app` (e depois `jorge@painel-quiabo.app`)
   - Password: a senha de cada um
   - marque **Auto Confirm User**
   - Esses e-mails não precisam existir; eles só identificam o usuário. No app cada um digita apenas `daniel` ou `jorge`.
6. Vá em **Project Settings → API** e anote:
   - **Project URL** (ex.: `https://abcd1234.supabase.co`)
   - a chave **anon public**
   - a chave **service_role** (secreta: não coloque em nenhum arquivo, só no Passo 3)

## Passo 2 — Ligar o app ao banco

Abra `docs/config.js` e troque os dois `COLE_AQUI...` pela **Project URL** e pela chave **anon public**. A chave anon é pública por natureza; quem protege os dados é o login.

## Passo 3 — Colocar no ar (GitHub), uns 10 minutos

1. Crie uma conta em **github.com** e um repositório novo, por exemplo `quiabo`. Ele precisa ser **Public** para o GitHub Pages gratuito. Não há senha nem chave secreta nos arquivos.
2. Envie todos os arquivos desta pasta mantendo as subpastas (**Add file → Upload files** e arraste o conteúdo).
   - A pasta `.github` às vezes não vai pelo arrastar, por começar com ponto. Se não aparecer no repositório, use **Add file → Create new file**, digite o nome `.github/workflows/cotacao.yml` e cole o conteúdo do arquivo.
3. **Settings → Pages**: em *Branch*, escolha `main` e a pasta `/docs`, e salve. Em um ou dois minutos aparece o endereço do app, algo como `https://seu-usuario.github.io/quiabo/`.
4. **Settings → Secrets and variables → Actions → New repository secret**, crie dois:
   - `SUPABASE_URL` com a Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` com a chave service_role
5. Aba **Actions → Cotação do quiabo → Run workflow** para testar. Em uns 2 minutos fica verde e a cotação do dia está no banco. Depois disso ela roda sozinha de segunda a sábado, às 18h47.

## Passo 4 — Instalar nos celulares

- **Android (Chrome):** abra o endereço do app, entre com `daniel` ou `jorge` e a senha, e toque em **Instalar** no topo (ou menu ⋮ → *Instalar app*).
- **iPhone (Safari):** abra o endereço, toque em **Compartilhar** e em **Adicionar à Tela de Início**.

O app fica com ícone próprio, abre em tela cheia e continua logado.

---

## Como o app calcula

- **Quiabo disponível** = tudo o que entrou − tudo o que foi vendido (em kg).
- **Valor do disponível** = kg disponíveis × preço em uso.
- **Preço em uso**: o da CEASA (mínimo, comum ou máximo do último boletim) ou o seu preço, conforme a escolha na aba Preços. A escolha vale para os dois celulares.
- Lançamentos em caixas viram kg pelo peso da caixa (14 kg por padrão, ajustável).
- **Saldo do mês** = vendas do mês − despesas do mês. **A receber** = vendas marcadas como não recebidas.

## Se algo der errado

| O que aparece | O que fazer |
|---|---|
| "O app ainda não foi ligado ao Supabase" | Preencha o `docs/config.js` (Passo 2) e envie de novo ao GitHub |
| "Usuário ou senha incorretos" | Confira o usuário criado no Passo 1.5 e a senha |
| "Este usuário entrou, mas não está liberado" | O e-mail do usuário precisa ser exatamente `daniel@painel-quiabo.app` ou `jorge@painel-quiabo.app`, e estar na tabela `socios` |
| A cotação ficou parada há dias (bolinha amarela) | Veja a aba **Actions** no GitHub; um X vermelho mostra o erro. Fins de semana e feriados não têm boletim |

## Trocar a senha

Supabase → **Authentication → Users** → nos três pontinhos do usuário (daniel ou jorge), **Delete user**, e crie de novo como no Passo 1.5 com a nova senha (o "reset por e-mail" não serve, porque esses e-mails não existem de verdade). Os lançamentos não se perdem. Nos celulares, toque em **Sair** e entre com a nova senha.
