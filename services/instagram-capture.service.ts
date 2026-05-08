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
}) {
  const errorMessage = input.message;

  await appendCaptureLog(input.captureJobId, errorMessage, {
    technicalError: input.technicalError instanceof Error ? input.technicalError.message : String(input.technicalError ?? ""),
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
    payload: { errorMessage },
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
  return page.evaluate(() => {
    const usernameFromHref = (href: string | null) => {
      if (!href) return null;
      const pathname = new URL(href, window.location.origin).pathname;
      const match = pathname.match(/^\/([A-Za-z0-9._]+)\/?$/);
      return match?.[1] ?? null;
    };

    const nodes = Array.from(document.querySelectorAll("article ul li"));
    const comments: ExtractedComment[] = [];

    for (const node of nodes) {
      const anchors = Array.from(node.querySelectorAll<HTMLAnchorElement>("a[href]"));
      const usernameAnchor = anchors.find((anchor) => usernameFromHref(anchor.getAttribute("href")));
      const username = usernameFromHref(usernameAnchor?.getAttribute("href") ?? null);

      if (!username) continue;

      const spanTexts = Array.from(node.querySelectorAll("span"))
        .map((span) => span.textContent?.trim() ?? "")
        .filter(Boolean)
        .filter((text) => text !== username);

      const text = Array.from(new Set(spanTexts)).join(" ").trim();
      const time = node.querySelector("time")?.getAttribute("datetime") ?? null;

      if (!text) continue;

      comments.push({
        username,
        text,
        commentedAt: time,
        rawData: {
          source: "article ul li",
          href: usernameAnchor?.getAttribute("href") ?? null,
        },
      });
    }

    return comments;
  });
}

function dedupeComments(comments: ExtractedComment[]) {
  const seen = new Set<string>();
  const unique: ExtractedComment[] = [];

  for (const comment of comments) {
    const signature = createCommentSignature(comment);
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

  try {
    await appendCaptureLog(input.captureJobId, captureMessages.opening);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      locale: "pt-BR",
      viewport: { width: 1366, height: 900 },
    });
    const page = await context.newPage();

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

    await appendCaptureLog(input.captureJobId, captureMessages.saving, {
      total: uniqueComments.length,
    });

    if (uniqueComments.length > 0) {
      await prisma.comment.createMany({
        data: uniqueComments.map((comment) => ({
          giveawayId: input.giveawayId,
          username: comment.username,
          text: comment.text,
          instagramCommentId: createCommentSignature(comment),
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
    if (error instanceof Error && error.message === captureMessages.unavailable) {
      throw error;
    }

    await failCapture({
      giveawayId: input.giveawayId,
      captureJobId: input.captureJobId,
      message: captureMessages.unavailable,
      technicalError: error,
    });
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
