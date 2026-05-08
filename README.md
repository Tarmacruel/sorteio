# Sorteio Auditavel

Aplicacao web SaaS para sorteios automatizados de comentarios do Instagram. O usuario informa a URL publica da postagem, configura regras, inicia a captura automatica via Playwright, revisa comentarios validos/invalidos, realiza o sorteio e publica uma pagina de resultado auditavel.

Nao existe importacao manual de comentarios nesta versao. Nao ha textarea para colar comentarios, upload de CSV, JSON ou planilha.

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
lib/                         Prisma, fila, constantes e utilitarios
prisma/                      Schema e migrations
schemas/                     Validacao Zod
services/                    Captura, validacao, sorteio e auditoria
types/                       Tipos compartilhados
workers/                     Worker BullMQ + Playwright
```

## Variaveis de ambiente

Copie `.env.example` para `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sorteio?schema=public"
REDIS_URL="redis://localhost:6379"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## Instalacao local

O projeto usa os servicos locais da maquina. Nao e necessario Docker.

Crie o banco no PostgreSQL local com o superusuario `postgres`:

```sql
CREATE DATABASE sorteio;
```

Depois instale dependencias e aplique as migrations:

```bash
npm install
npx prisma migrate deploy
npx playwright install chromium
```

Garanta tambem que o Redis local esteja rodando em `redis://localhost:6379`, pois a captura automatica usa BullMQ.

## Execucao

Use os scripts locais sem Docker:

```bat
scripts\setup-sorteio.bat
scripts\start-sorteio.bat
scripts\status-sorteio.bat
scripts\stop-sorteio.bat
```

O `start-sorteio.bat` inicia PostgreSQL local quando houver servico, Redis em `localhost:6379`, worker BullMQ e Next.js. Logs ficam em `logs/`.

Execucao manual alternativa:

```bash
npm run dev
```

Em outro terminal, rode o worker de captura:

```bash
npm run worker:dev
```

Abra `http://localhost:3000`.

## Fluxo principal

1. Criar um sorteio em `/sorteios/novo`.
2. Informar a URL publica da postagem do Instagram.
3. Configurar regras de participacao.
4. Iniciar captura automatica.
5. Acompanhar status e logs em `/sorteios/[id]/captura`.
6. Revisar comentarios validos e invalidos em `/sorteios/[id]/revisao`.
7. Realizar o sorteio.
8. Publicar e compartilhar `/resultado/[id]`.

## Captura com Playwright

O worker consome a fila BullMQ `instagram-capture` e executa `captureInstagramComments` em `services/instagram-capture.service.ts`.

Responsabilidades implementadas:

- Validar URL de publicacao do Instagram.
- Abrir Chromium headless.
- Acessar a postagem publica.
- Clicar em botoes de "ver mais comentarios" quando disponiveis.
- Rolar a pagina progressivamente.
- Extrair username, texto e data/hora quando disponivel.
- Remover duplicidades por hash.
- Salvar comentarios no PostgreSQL.
- Atualizar status, contadores e logs tecnicos.
- Registrar auditoria de inicio, conclusao e falha.

## Limitacoes tecnicas e de seguranca

Esta versao coleta apenas comentarios publicamente acessiveis. Ela nao burla CAPTCHA, nao tenta contornar bloqueios, nao faz fingerprint spoofing, nao usa rotacao agressiva de proxy, nao forca login e nao solicita ou armazena senha do Instagram.

Se a postagem exigir login, estiver indisponivel, for privada, estiver bloqueada ou o Instagram limitar o carregamento, o sistema registra falha tecnica e informa uma mensagem amigavel ao usuario.

O HTML do Instagram muda com frequencia. A captura via Playwright pode precisar de ajustes nos seletores e deve ser usada com limites operacionais responsaveis.

## Regras de validacao

Regras disponiveis:

- Palavra ou frase obrigatoria.
- Hashtag obrigatoria.
- Quantidade minima de marcacoes.
- Exigir ao menos uma marcacao.
- Palavras proibidas.
- Usuarios excluidos.
- Usuarios permitidos.
- Excluir perfil organizador.
- Ignorar comentarios duplicados.
- Ignorar comentarios vazios ou muito curtos.
- Data/hora limite dos comentarios.

Motivos de exclusao sao salvos no comentario e aparecem na revisao e exportacoes.

## Sorteio e auditoria

O sorteio usa `crypto` para gerar seed, cria hash canonico da lista de participantes validos e ordena participantes de forma deterministica por SHA-256. O resultado salva vencedores, suplentes, seed, hash, data/hora e logs de auditoria.

Exportacoes disponiveis na pagina publica:

- Resultado em JSON.
- Participantes validos em CSV.
- Comentarios invalidos em CSV.
- Relatorio tecnico em JSON.

A exportacao em PDF fica preparada para fase futura.

## Proximos passos

- Integrar com a API oficial da Meta/Instagram Graph API quando o caso de uso e permissoes forem aprovados.
- Adicionar autenticacao e multi-tenant.
- Criar plano de rate limiting operacional por usuario.
- Melhorar observabilidade do worker.
- Adicionar testes automatizados para validacao e sorteio.
