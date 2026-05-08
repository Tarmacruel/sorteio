# Sorteio Auditável

Aplicação web SaaS para sorteios automatizados de comentários do Instagram. O usuário informa a URL pública da postagem, configura regras, inicia a captura automática via Playwright, revisa comentários válidos/inválidos, realiza o sorteio e publica uma página de resultado auditável.

Não existe importação manual de comentários nesta versão. Não há textarea para colar comentários, upload de CSV, JSON ou planilha.

## Stack

- Next.js com App Router
- TypeScript
- Tailwind CSS
- shadcn/ui local
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ
- Playwright
- Zod

## Estrutura

```txt
app/                         Rotas web e API routes
components/                  UI e componentes de produto
lib/                         Prisma, fila, constantes e utilitários
prisma/                      Schema e migrations
schemas/                     Validação Zod
services/                    Captura, validação, sorteio e auditoria
types/                       Tipos compartilhados
workers/                     Worker BullMQ + Playwright
```

## Variáveis de ambiente

Copie `.env.example` para `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sorteio?schema=public"
REDIS_URL="redis://localhost:6379"
NEXT_PUBLIC_APP_URL="http://localhost:4000"
INSTAGRAM_AUTH_STATE_PATH="storage/instagram-auth.json"
INSTAGRAM_CAPTURE_MAX_ITERATIONS=2500
INSTAGRAM_CAPTURE_NO_GROWTH_LIMIT=30
INSTAGRAM_CAPTURE_SCROLL_DELAY_MS=1000
INSTAGRAM_CAPTURE_TIMEOUT_MS=3600000
```

## Instalação local

O projeto usa os serviços locais da máquina. Não é necessário Docker.

Crie o banco no PostgreSQL local com o superusuário `postgres`:

```sql
CREATE DATABASE sorteio;
```

Depois instale dependências e aplique as migrations:

```bash
npm install
npx prisma migrate deploy
npx playwright install chromium
```

Garanta também que o Redis local esteja rodando em `redis://localhost:6379`, pois a captura automática usa BullMQ.

Antes de iniciar qualquer captura, salve uma sessão autenticada do Instagram:

```bash
npm run instagram:auth
```

O script abre o Chromium em modo visível para login manual e salva somente o `storageState` em `storage/instagram-auth.json`. Usuário e senha não são salvos pela aplicação. Sem esse arquivo, a API bloqueia o início da captura e solicita login manual.

## Execução

Use os scripts locais sem Docker:

```bat
scripts\setup-sorteio.bat
scripts\start-sorteio.bat
scripts\status-sorteio.bat
scripts\stop-sorteio.bat
```

O `start-sorteio.bat` inicia PostgreSQL local quando houver serviço, Redis em `localhost:6379`, worker BullMQ e Next.js. Logs ficam em `logs/`.

Execução manual alternativa:

```bash
npm run dev
```

Em outro terminal, rode o worker de captura:

```bash
npm run worker:dev
```

Abra `http://localhost:4000`.

## Fluxo principal

1. Criar um sorteio em `/sorteios/novo`.
2. Informar a URL pública da postagem do Instagram.
3. Configurar regras de participação.
4. Iniciar captura automática.
5. Acompanhar status e logs em `/sorteios/[id]/captura`.
6. Revisar comentários válidos e inválidos em `/sorteios/[id]/revisao`.
7. Realizar o sorteio.
8. Publicar e compartilhar `/resultado/[id]`.

## Captura com Playwright

O worker consome a fila BullMQ `instagram-capture` e executa `captureInstagramComments` em `services/instagram-capture.service.ts`.

Responsabilidades implementadas:

- Validar URL de publicação do Instagram.
- Abrir Chromium headless.
- Acessar a postagem pública.
- Exigir `storage/instagram-auth.json`, sem armazenar credenciais.
- Clicar em botões de "ver mais comentários" quando disponíveis.
- Rolar o painel de comentários progressivamente.
- Extrair username, texto e data/hora quando disponível.
- Remover duplicidades por hash.
- Registrar captura parcial quando o Instagram não carregar todos os comentários informados.
- Salvar comentários no PostgreSQL.
- Atualizar status, contadores e logs técnicos.
- Registrar auditoria de início, conclusão e falha.

## Limitações técnicas e de segurança

Esta versão coleta apenas comentários publicamente acessíveis. Ela não burla CAPTCHA, não tenta contornar bloqueios, não faz fingerprint spoofing, não usa rotação agressiva de proxy, não força login e não solicita ou armazena senha do Instagram.

Se a postagem exigir login, estiver indisponível, for privada, estiver bloqueada ou o Instagram limitar o carregamento, o sistema registra falha técnica e informa uma mensagem amigável ao usuário.

O HTML do Instagram muda com frequência. A captura via Playwright pode precisar de ajustes nos seletores e deve ser usada com limites operacionais responsáveis.

## Regras de validação

Regras disponíveis:

- Palavra ou frase obrigatória.
- Hashtag obrigatória.
- Quantidade mínima de marcações.
- Exigir ao menos uma marcação.
- Palavras proibidas.
- Usuários excluídos.
- Usuários permitidos.
- Excluir perfil organizador.
- Ignorar comentários duplicados.
- Ignorar comentários vazios ou muito curtos.
- Data/hora limite dos comentários.

Motivos de exclusão são salvos no comentário e aparecem na revisão e exportações.

## Sorteio e auditoria

O sorteio usa `crypto` para gerar seed, cria hash canônico da lista de participantes válidos e ordena participantes de forma determinística por SHA-256. O resultado salva vencedores, suplentes, seed, hash, data/hora e logs de auditoria.

Exportações disponíveis na página pública:

- Resultado em JSON.
- Participantes válidos em CSV.
- Comentários inválidos em CSV.
- Relatório técnico em JSON.

A exportação em PDF fica preparada para fase futura.

## Próximos passos

- Integrar com a API oficial da Meta/Instagram Graph API quando o caso de uso e permissões forem aprovados.
- Adicionar autenticação e multi-tenant.
- Criar plano de rate limiting operacional por usuário.
- Melhorar observabilidade do worker.
- Adicionar testes automatizados para validação e sorteio.
