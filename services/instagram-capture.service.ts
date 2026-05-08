import { chromium, type Page } from "playwright";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { captureMessages } from "@/lib/constants";
import { createCommentSignature, validateInstagramPostUrl } from "@/lib/instagram";
import { registerAuditLog } from "@/services/audit.service";

type CaptureLog = {
  at: string;
  message: string;
  details?: Prisma.InputJsonObject;
};

type ExtractedComment = {
  username: string;
  text: string;
  instagramCommentId?: string | null;
  commentedAt?: string | null;
  rawData?: Prisma.InputJsonObject;
};

async function appendCaptureLog(captureJobId: string, message: string, details?: Prisma.InputJsonObject) {
  const job = await prisma.instagramCaptureJob.findUnique({
    where: { id: captureJobId },
    select: { logs: true },
  });

  const logs = Array.isArray(job?.logs) ? (job?.logs as CaptureLog[]) : [];

  await prisma.instagramCaptureJob.update({
    where: { id: captureJobId },
    data: {
      currentStep: message,
      logs: [
        ...logs,
        {
          at: new Date().toISOString(),
          message,
          details,
        },
      ] as Prisma.InputJsonValue,
    },
  });
}

async function failCapture(input: {
  giveawayId: string;
  captureJobId: string;
  message: string;
  technicalError?: unknown;
  details?: Prisma.InputJsonObject;
}) {
  const errorMessage = input.message;
  const technicalError =
    input.technicalError instanceof Error
      ? {
          name: input.technicalError.name,
          message: input.technicalError.message,
          stack: input.technicalError.stack?.slice(0, 2000) ?? null,
        }
      : input.technicalError
        ? { message: String(input.technicalError) }
        : null;

  await appendCaptureLog(input.captureJobId, errorMessage, {
    ...(input.details ?? {}),
    technicalError,
  });

  await prisma.instagramCaptureJob.update({
    where: { id: input.captureJobId },
    data: {
      status: "failed",
      finishedAt: new Date(),
      errorMessage,
      currentStep: errorMessage,
    },
  });

  await prisma.giveaway.update({
    where: { id: input.giveawayId },
    data: { status: "capture_failed" },
  });

  await registerAuditLog({
    giveawayId: input.giveawayId,
    action: "capture_failed",
    payload: { errorMessage, technicalError, details: input.details ?? {} },
  });

  throw new Error(errorMessage);
}

async function detectPublicAccessProblem(page: Page) {
  const currentUrl = page.url().toLowerCase();
  const bodyText = await page.locator("body").innerText({ timeout: 6000 }).catch(() => "");
  const text = bodyText.toLowerCase();

  if (currentUrl.includes("/accounts/login")) {
    return "A publicacao direcionou para login. Esta versao coleta apenas comentarios publicamente acessiveis.";
  }

  const blockedSignals = [
    "captcha",
    "challenge",
    "login to continue",
    "log in to continue",
    "entre para continuar",
    "faca login para continuar",
    "faça login para continuar",
    "sorry, this page isn't available",
    "esta pagina nao esta disponivel",
    "esta página não está disponível",
  ];

  if (blockedSignals.some((signal) => text.includes(signal))) {
    return captureMessages.unavailable;
  }

  return null;
}

async function collectPageDiagnostics(page?: Page): Promise<Prisma.InputJsonObject> {
  if (!page) return {};

  return page
    .evaluate<Prisma.InputJsonObject>(String.raw`
      (() => {
      const buttonTexts = Array.from(document.querySelectorAll("button"))
        .map((button) => button.textContent ? button.textContent.trim() : "")
        .filter(Boolean)
        .slice(0, 12);

      const bodyText = document.body && document.body.innerText ? document.body.innerText.replace(/\s+/g, " ").trim() : "";

      return {
        currentUrl: window.location.href,
        title: document.title,
        bodySnippet: bodyText.slice(0, 800),
        selectorCounts: {
          articles: document.querySelectorAll("article").length,
          articleLists: document.querySelectorAll("article ul").length,
          articleListItems: document.querySelectorAll("article ul li").length,
          commentPermalinks: document.querySelectorAll('a[href*="/c/"]').length,
          links: document.querySelectorAll("a[href]").length,
          buttons: document.querySelectorAll("button").length,
          timeTags: document.querySelectorAll("time").length,
        },
        buttonTexts,
      };
      })()
    `)
    .catch((error) => ({
      diagnosticsError: error instanceof Error ? error.message : String(error),
      currentUrl: page.url(),
    }));
}

async function clickLoadMore(page: Page) {
  const button = page
    .getByRole("button")
    .filter({
      hasText:
        /ver mais comentarios|ver todos os comentarios|carregar mais|mais comentarios|view all comments|view more comments|load more comments|show more comments/i,
    })
    .first();

  if ((await button.count().catch(() => 0)) === 0) {
    return false;
  }

  await button.click({ timeout: 2500 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  return true;
}

async function extractVisibleComments(page: Page): Promise<ExtractedComment[]> {
  return page.evaluate<ExtractedComment[]>(String.raw`
    (() => {
    const usernameFromHref = (href) => {
      if (!href) return null;
      const pathname = new URL(href, window.location.origin).pathname;
      const match = pathname.match(/^\/([A-Za-z0-9._]+)\/?$/);
      return match ? match[1] : null;
    };

    const isCommentPermalink = (href) => Boolean(href && /\/p\/[^/]+\/c\/[0-9]+\/?/.test(href));
    const commentIdFromHref = (href) => {
      const match = href ? href.match(/\/c\/([0-9]+)\/?/) : null;
      return match ? match[1] : null;
    };
    const isStopText = (value) => /^(Curtir|Responder|Ver traducao|Ver tradução|[0-9]+ curtida[s]?|Ocultar respostas|Ver respostas)$/i.test(value);
    const normalizeText = (value) => value.replace(/\s+/g, " ").trim();
    const comments = [];
    const seenIds = new Set();

    const pushComment = (comment) => {
      const key = comment.instagramCommentId || comment.username + "|" + comment.text;
      if (!comment.username || !comment.text || seenIds.has(key)) return;
      seenIds.add(key);
      comments.push(comment);
    };

    const nodes = Array.from(document.querySelectorAll("article ul li"));

    for (const node of nodes) {
      const anchors = Array.from(node.querySelectorAll("a[href]"));
      const usernameAnchor = anchors.find((anchor) => usernameFromHref(anchor.getAttribute("href")));
      const username = usernameFromHref(usernameAnchor ? usernameAnchor.getAttribute("href") : null);

      if (!username) continue;

      const spanTexts = Array.from(node.querySelectorAll("span"))
        .map((span) => span.textContent ? span.textContent.trim() : "")
        .filter(Boolean)
        .filter((text) => text !== username);

      const text = Array.from(new Set(spanTexts)).join(" ").trim();
      const timeNode = node.querySelector("time");
      const time = timeNode ? timeNode.getAttribute("datetime") : null;

      if (!text) continue;

      pushComment({
        username,
        text,
        commentedAt: time,
        rawData: {
          source: "article ul li",
          href: usernameAnchor ? usernameAnchor.getAttribute("href") : null,
        },
      });
    }

    const permalinkAnchors = Array.from(document.querySelectorAll('a[href*="/c/"]')).filter((anchor) =>
      isCommentPermalink(anchor.getAttribute("href"))
    );

    for (const timeAnchor of permalinkAnchors) {
      const href = timeAnchor.getAttribute("href");
      const commentId = commentIdFromHref(href);
      if (!commentId) continue;

      let container = timeAnchor.parentElement;
      let selected = null;

      for (let depth = 0; container && depth < 10; depth += 1) {
        const text = normalizeText(container.textContent || "");
        const anchors = Array.from(container.querySelectorAll("a[href]"));
        const hasTime = anchors.includes(timeAnchor);
        const hasResponder = /Responder/i.test(text);

        if (hasTime && anchors.length >= 2 && text.length <= 900 && (hasResponder || depth >= 2)) {
          selected = container;
          break;
        }

        container = container.parentElement;
      }

      if (!selected) continue;

      const anchors = Array.from(selected.querySelectorAll("a[href]"));
      const timeIndex = anchors.indexOf(timeAnchor);
      const usernameAnchor = anchors
        .slice(0, Math.max(timeIndex, 0))
        .reverse()
        .find((anchor) => {
          const username = usernameFromHref(anchor.getAttribute("href"));
          const label = normalizeText(anchor.textContent || "");
          return username && label && !label.startsWith("@");
        });

      const username = usernameFromHref(usernameAnchor ? usernameAnchor.getAttribute("href") : null);
      if (!username) continue;

      const pieces = [];
      const walker = document.createTreeWalker(selected, NodeFilter.SHOW_TEXT);
      let afterTime = false;

      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        const value = normalizeText(textNode.textContent || "");
        if (!value) continue;

        if (timeAnchor.contains(textNode)) {
          afterTime = true;
          continue;
        }

        if (!afterTime) continue;
        if (isStopText(value)) break;
        if (value === username) continue;

        pieces.push(value);
      }

      let text = normalizeText(pieces.join(" "));

      if (!text) {
        text = anchors
          .slice(timeIndex + 1)
          .map((anchor) => normalizeText(anchor.textContent || ""))
          .filter(Boolean)
          .filter((value) => !isStopText(value))
          .join(" ");
      }

      if (!text) continue;

      pushComment({
        username,
        text,
        instagramCommentId: commentId,
        commentedAt: null,
        rawData: {
          source: "comment permalink anchor",
          href,
        },
      });
    }

    return comments;
    })()
  `);
}

function dedupeComments(comments: ExtractedComment[]) {
  const seen = new Set<string>();
  const unique: ExtractedComment[] = [];

  for (const comment of comments) {
    const signature = comment.instagramCommentId ?? createCommentSignature(comment);
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(comment);
  }

  return unique;
}

function parseCommentedAt(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isKnownCaptureFailure(error: unknown) {
  if (!(error instanceof Error)) return false;

  return (
    error.message === captureMessages.unavailable ||
    error.message.includes("coleta apenas comentarios publicamente acessiveis") ||
    error.message.includes("Informe a URL publica")
  );
}

export async function captureInstagramComments(input: {
  giveawayId: string;
  postUrl: string;
  captureJobId: string;
}) {
  if (!validateInstagramPostUrl(input.postUrl)) {
    await failCapture({
      giveawayId: input.giveawayId,
      captureJobId: input.captureJobId,
      message: "Informe a URL publica de uma publicacao do Instagram.",
    });
  }

  await prisma.instagramCaptureJob.update({
    where: { id: input.captureJobId },
    data: {
      status: "running",
      startedAt: new Date(),
      currentStep: captureMessages.opening,
    },
  });

  await prisma.giveaway.update({
    where: { id: input.giveawayId },
    data: { status: "capturing" },
  });

  await registerAuditLog({
    giveawayId: input.giveawayId,
    action: "capture_started",
    payload: { postUrl: input.postUrl, captureJobId: input.captureJobId },
  });

  let browser;
  let page: Page | undefined;

  try {
    await appendCaptureLog(input.captureJobId, captureMessages.opening);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      locale: "pt-BR",
      viewport: { width: 1366, height: 900 },
    });
    page = await context.newPage();

    await page.goto(input.postUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    const accessProblem = await detectPublicAccessProblem(page);
    if (accessProblem) {
      await failCapture({
        giveawayId: input.giveawayId,
        captureJobId: input.captureJobId,
        message: accessProblem,
        details: await collectPageDiagnostics(page),
      });
    }

    await appendCaptureLog(input.captureJobId, captureMessages.loading);
    await page.waitForTimeout(2500);

    const collected = new Map<string, ExtractedComment>();
    let stagnantRounds = 0;
    let lastCount = 0;

    for (let round = 0; round < 24; round += 1) {
      await appendCaptureLog(input.captureJobId, round === 0 ? captureMessages.loading : captureMessages.loadingMore, {
        round: round + 1,
      });

      await clickLoadMore(page);
      await page.mouse.wheel(0, 1600);
      await page.waitForTimeout(1200);

      const visibleComments = await extractVisibleComments(page);

      for (const comment of visibleComments) {
        const signature = createCommentSignature(comment);
        collected.set(signature, comment);
      }

      await prisma.instagramCaptureJob.update({
        where: { id: input.captureJobId },
        data: {
          commentsFound: collected.size,
          currentStep: captureMessages.loadingMore,
        },
      });

      if (collected.size === lastCount) {
        stagnantRounds += 1;
      } else {
        stagnantRounds = 0;
        lastCount = collected.size;
      }

      if (stagnantRounds >= 4) break;
    }

    await appendCaptureLog(input.captureJobId, captureMessages.dedupe);
    const uniqueComments = dedupeComments(Array.from(collected.values()));

    if (uniqueComments.length === 0) {
      await failCapture({
        giveawayId: input.giveawayId,
        captureJobId: input.captureJobId,
        message: captureMessages.unavailable,
        details: {
          ...(await collectPageDiagnostics(page)),
          possibleCause:
            "A estrutura do Instagram pode ter mudado, os comentarios podem nao estar publicamente visiveis ou a publicacao pode exigir login.",
          commentsExtractedBeforeSave: 0,
        },
      });
    }

    await appendCaptureLog(input.captureJobId, captureMessages.saving, {
      total: uniqueComments.length,
    });

    if (uniqueComments.length > 0) {
      await prisma.comment.createMany({
        data: uniqueComments.map((comment) => ({
          giveawayId: input.giveawayId,
          username: comment.username,
          text: comment.text,
          instagramCommentId: comment.instagramCommentId ?? createCommentSignature(comment),
          commentedAt: parseCommentedAt(comment.commentedAt),
          rawData: (comment.rawData ?? {}) as Prisma.InputJsonObject,
        })),
        skipDuplicates: true,
      });
    }

    const commentsSaved = await prisma.comment.count({
      where: { giveawayId: input.giveawayId },
    });

    await prisma.instagramCaptureJob.update({
      where: { id: input.captureJobId },
      data: {
        status: "completed",
        finishedAt: new Date(),
        commentsFound: uniqueComments.length,
        commentsSaved,
        currentStep: captureMessages.completed,
      },
    });

    await prisma.giveaway.update({
      where: { id: input.giveawayId },
      data: {
        status: "captured",
        capturedAt: new Date(),
      },
    });

    await appendCaptureLog(input.captureJobId, captureMessages.completed, {
      commentsSaved,
    });

    await registerAuditLog({
      giveawayId: input.giveawayId,
      action: "capture_completed",
      payload: {
        commentsFound: uniqueComments.length,
        commentsSaved,
        captureJobId: input.captureJobId,
      },
    });

    return {
      commentsFound: uniqueComments.length,
      commentsSaved,
    };
  } catch (error) {
    if (isKnownCaptureFailure(error)) {
      throw error;
    }

    await failCapture({
      giveawayId: input.giveawayId,
      captureJobId: input.captureJobId,
      message: captureMessages.unavailable,
      technicalError: error,
      details: await collectPageDiagnostics(page),
    });
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
