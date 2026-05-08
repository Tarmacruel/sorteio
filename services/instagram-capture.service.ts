import fs from "node:fs";
import { chromium, type ElementHandle, type Page } from "playwright";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { captureMessages } from "@/lib/constants";
import { createCommentSignature, validateInstagramPostUrl } from "@/lib/instagram";
import { getInstagramAuthStatePath } from "@/lib/instagram-auth";
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
  permalink?: string | null;
  commentedAt?: string | null;
  profileImageUrl?: string | null;
  rawData?: Prisma.InputJsonObject;
};

type CaptureFailureStatus = "failed" | "blocked";

type InstagramBlocker = {
  status: CaptureFailureStatus;
  message: string;
  reason: string;
};

type CaptureConfig = {
  maxIterations: number;
  noGrowthLimit: number;
  scrollDelayMs: number;
  timeoutMs: number;
};

class CaptureFailure extends Error {
  constructor(
    message: string,
    public readonly status: CaptureFailureStatus,
  ) {
    super(message);
    this.name = "CaptureFailure";
  }
}

function readPositiveIntEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getCaptureConfig(): CaptureConfig {
  return {
    maxIterations: readPositiveIntEnv("INSTAGRAM_CAPTURE_MAX_ITERATIONS", 2500),
    noGrowthLimit: readPositiveIntEnv("INSTAGRAM_CAPTURE_NO_GROWTH_LIMIT", 30),
    scrollDelayMs: readPositiveIntEnv("INSTAGRAM_CAPTURE_SCROLL_DELAY_MS", 1000),
    timeoutMs: readPositiveIntEnv("INSTAGRAM_CAPTURE_TIMEOUT_MS", 3_600_000),
  };
}

function resolveAuthStatePath() {
  return getInstagramAuthStatePath();
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCommentText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getCommentDedupeKey(comment: ExtractedComment) {
  const username = comment.username.trim().replace(/^@/, "").toLowerCase();
  const text = normalizeCommentText(comment.text).toLowerCase();
  const stableId = comment.instagramCommentId ?? comment.permalink ?? comment.commentedAt ?? "";

  return stableId ? `${username}|${text}|${stableId}` : `${username}|${text}`;
}

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
  status?: CaptureFailureStatus;
  technicalError?: unknown;
  details?: Prisma.InputJsonObject;
}) {
  const status = input.status ?? "failed";
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
      status,
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
    action: status === "blocked" ? "capture_blocked" : "capture_failed",
    payload: { errorMessage, status, technicalError, details: input.details ?? {} },
  });

  throw new CaptureFailure(errorMessage, status);
}

async function detectInstagramBlockers(page: Page): Promise<InstagramBlocker | null> {
  const currentUrl = page.url().toLowerCase();
  const bodyText = await page.locator("body").innerText({ timeout: 6000 }).catch(() => "");
  const text = normalizeSearchText(bodyText);

  if (currentUrl.includes("/accounts/login")) {
    return {
      status: "blocked",
      reason: "login_required",
      message: "Não foi possível continuar: Instagram solicitou login, verificação ou bloqueou o carregamento.",
    };
  }

  if (currentUrl.includes("/challenge") || currentUrl.includes("/checkpoint")) {
    return {
      status: "blocked",
      reason: "checkpoint_or_challenge",
      message: "Não foi possível continuar: Instagram solicitou verificação de segurança.",
    };
  }

  const blockedSignals = [
    "captcha",
    "checkpoint",
    "challenge",
    "security code",
    "confirm your account",
    "verify your account",
    "suspicious activity",
    "atividade suspeita",
    "codigo de segurança",
    "verifique sua conta",
    "desafio de segurança",
    "login to continue",
    "log in to continue",
    "entre para continuar",
    "faca login para continuar",
  ];

  if (blockedSignals.some((signal) => text.includes(signal))) {
    return {
      status: "blocked",
      reason: "blocked_or_verification_required",
      message: "Não foi possível continuar: Instagram solicitou login, verificação ou bloqueou o carregamento.",
    };
  }

  const unavailableSignals = [
    "sorry, this page isn't available",
    "this page isn't available",
    "page not found",
    "página não está disponível",
    "publicação removida",
    "conteudo indisponível",
  ];

  if (unavailableSignals.some((signal) => text.includes(signal))) {
    return {
      status: "failed",
      reason: "post_unavailable",
      message: captureMessages.unavailable,
    };
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
          scrollableElements: Array.from(document.querySelectorAll("main, article, aside, section, div, ul"))
            .filter((element) => element.scrollHeight > element.clientHeight + 60).length,
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

async function extractExpectedCommentCount(page: Page): Promise<number | null> {
  return page
    .evaluate<number | null>(String.raw`
      (() => {
      const simplify = (value) => (value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      const parseCount = (value) => {
        const simplified = simplify(value);
        const match = simplified.match(/([0-9][0-9.,]*)(?:\s*(mil|k))?/);
        if (!match) return null;

        const raw = match[1];
        const suffix = match[2];
        let parsed;

        if (suffix) {
          parsed = Number.parseFloat(raw.replace(/\./g, "").replace(",", "."));
          parsed = Number.isFinite(parsed) ? Math.round(parsed * 1000) : null;
        } else {
          parsed = Number.parseInt(raw.replace(/[.,]/g, ""), 10);
        }

        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      };

      const extractFromLabeledText = (value) => {
        const simplified = simplify(value);
        const matches = Array.from(simplified.matchAll(/([0-9][0-9.,]*(?:\s*(?:mil|k))?)\s*(?:comentário|comentários|comment|comments)\b/g));
        return matches.map((match) => parseCount(match[1])).filter((count) => Number.isFinite(count));
      };

      const candidates = [];

      for (const meta of Array.from(document.querySelectorAll("meta[content]"))) {
        candidates.push(...extractFromLabeledText(meta.getAttribute("content") || ""));
      }

      for (const element of Array.from(document.querySelectorAll("[aria-label], [title]"))) {
        candidates.push(...extractFromLabeledText(element.getAttribute("aria-label") || ""));
        candidates.push(...extractFromLabeledText(element.getAttribute("title") || ""));
      }

      const commentIconElements = Array.from(document.querySelectorAll("[aria-label], svg, button, [role='button']"))
        .filter((element) => {
          const label = simplify(element.getAttribute("aria-label") || element.textContent || "");
          return label.includes("coment") || label.includes("comment");
        });

      for (const icon of commentIconElements) {
        const clickable = icon.closest("button, [role='button'], a") || icon;
        const parent = clickable.parentElement;
        if (!parent) continue;

        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(clickable);
        const nearby = siblings.slice(Math.max(0, index), index + 4);

        for (const node of nearby) {
          const text = node.textContent || "";
          const numbers = Array.from(text.matchAll(/\b[0-9][0-9.,]*\b/g))
            .map((match) => parseCount(match[0]))
            .filter((count) => Number.isFinite(count));
          candidates.push(...numbers);
        }
      }

      const numericCandidates = candidates
        .filter((count) => Number.isFinite(count) && count > 0 && count < 1000000);

      return numericCandidates.length > 0 ? Math.max(...numericCandidates) : null;
      })()
    `)
    .catch(() => null);
}

async function findCommentsScrollContainer(page: Page): Promise<ElementHandle<HTMLElement> | null> {
  const handle = await page
    .evaluateHandle(String.raw`
      (() => {
      const candidates = Array.from(document.querySelectorAll("main, article, aside, section, div, ul"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          const scrollable = element.scrollHeight > element.clientHeight + 80;
          const visible = rect.width > 160 && rect.height > 160 && style.visibility !== "hidden" && style.display !== "none";
          const commentSignals = element.querySelectorAll('a[href*="/c/"], time').length;
          const buttonSignals = Array.from(element.querySelectorAll("button, [role='button'], a"))
            .some((child) => /coment|comment|more|mais|anteriores/i.test(child.textContent || child.getAttribute("aria-label") || ""));
          const score =
            (scrollable ? 1000 : 0) +
            Math.min(commentSignals, 30) * 20 +
            (buttonSignals ? 50 : 0) +
            Math.min(element.scrollHeight - element.clientHeight, 2000) / 10;

          return { element, visible, scrollable, score };
        })
        .filter((candidate) => candidate.visible && candidate.scrollable)
        .sort((a, b) => b.score - a.score);

      return candidates[0] ? candidates[0].element : null;
      })()
    `)
    .catch(() => null);

  if (!handle) return null;

  const element = handle.asElement() as ElementHandle<HTMLElement> | null;
  if (!element) {
    await handle.dispose().catch(() => undefined);
    return null;
  }

  return element;
}

async function clickLoadMoreComments(page: Page) {
  const textPattern =
    /ver mais comentários|ver mais comentários|carregar mais comentários|carregar mais comentários|ver comentários anteriores|ver comentários anteriores|view more comments|load more comments|more comments|view previous comments|previous comments/i;

  const visibleTextTarget = page.locator("button, [role='button'], a").filter({ hasText: textPattern }).first();

  if ((await visibleTextTarget.count().catch(() => 0)) > 0) {
    await visibleTextTarget.scrollIntoViewIfNeeded().catch(() => undefined);
    await visibleTextTarget.click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    return true;
  }

  const ariaTarget = page
    .locator(
      [
        "button[aria-label*='coment']",
        "button[aria-label*='Coment']",
        "[role='button'][aria-label*='coment']",
        "[role='button'][aria-label*='Coment']",
        "a[aria-label*='comment']",
        "a[aria-label*='Comment']",
      ].join(", "),
    )
    .filter({ hasText: /mais|more|load|view|anteriores|previous/i })
    .first();

  if ((await ariaTarget.count().catch(() => 0)) > 0) {
    await ariaTarget.scrollIntoViewIfNeeded().catch(() => undefined);
    await ariaTarget.click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    return true;
  }

  const clicked = await page
    .evaluate<boolean>(String.raw`
      (() => {
      const simplify = (value) => (value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      const patterns = [
        "ver mais comentários",
        "carregar mais comentários",
        "ver comentários anteriores",
        "view more comments",
        "load more comments",
        "more comments",
        "view previous comments",
        "previous comments"
      ];

      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const elements = Array.from(document.querySelectorAll("button, [role='button'], a, div[tabindex]"));
      const target = elements.find((element) => {
        if (!isVisible(element)) return false;
        const text = simplify([
          element.textContent,
          element.getAttribute("aria-label"),
          element.getAttribute("title")
        ].filter(Boolean).join(" "));
        return patterns.some((pattern) => text.includes(pattern));
      });

      if (!target) return false;

      target.scrollIntoView({ block: "center", inline: "center" });
      target.click();
      return true;
      })()
    `)
    .catch(() => false);

  if (clicked) {
    await page.waitForTimeout(600);
  }

  return clicked;
}

async function scrollCommentsContainer(page: Page, containerHandle: ElementHandle<HTMLElement> | null) {
  if (containerHandle) {
    await containerHandle.scrollIntoViewIfNeeded().catch(() => undefined);

    let box = await containerHandle.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) {
      box = await page
        .evaluateHandle(() => {
          const candidates = Array.from(document.querySelectorAll("main, article, aside, section, div, ul"))
            .map((element) => {
              const rect = element.getBoundingClientRect();
              const links = element.querySelectorAll('a[href*="/c/"]').length;
              const times = element.querySelectorAll("time").length;
              const scrollable = element.scrollHeight > element.clientHeight + 30;
              const visible = rect.width > 100 && rect.height > 100;
              const score =
                (scrollable ? 1000 : 0) +
                links * 100 +
                times * 20 +
                Math.min(element.scrollHeight - element.clientHeight, 2500) / 10;

              return { element, visible, score };
            })
            .filter((candidate) => candidate.visible)
            .sort((a, b) => b.score - a.score);

          const target = candidates[0]?.element ?? null;
          target?.scrollIntoView({ block: "center", inline: "nearest" });
          return target;
        })
        .then(async (handle) => {
          const element = handle.asElement() as ElementHandle<HTMLElement> | null;
          const fallbackBox = element ? await element.boundingBox().catch(() => null) : null;
          await handle.dispose().catch(() => undefined);
          return fallbackBox;
        })
        .catch(() => null);
    }

    if (box) {
      const viewport = page.viewportSize() ?? { width: 1280, height: 900 };
      const x = Math.min(Math.max(box.x + box.width * 0.55, 20), viewport.width - 20);
      const y = Math.min(Math.max(box.y + box.height * 0.82, 20), viewport.height - 20);

      await page.mouse.move(x, y).catch(() => undefined);
      await page.mouse.wheel(0, 450).catch(() => undefined);
      await page.waitForTimeout(350);
      await page.mouse.wheel(0, 650).catch(() => undefined);
      return true;
    }
  }

  await page.mouse.wheel(0, 1400).catch(() => undefined);
  return page
    .evaluate(() => {
      const before = window.scrollY;
      window.scrollBy(0, 1400);
      return window.scrollY !== before;
    })
    .catch(() => false);
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

    const normalizeText = (value) => (value || "").replace(/\s+/g, " ").trim();
    const normalizeSearch = (value) => normalizeText(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const isCommentPermalink = (href) => Boolean(href && /\/p\/[^/]+\/c\/[0-9]+\/?/.test(href));
    const commentIdFromHref = (href) => {
      const match = href ? href.match(/\/c\/([0-9]+)\/?/) : null;
      return match ? match[1] : null;
    };
    const imageSource = (image) => image.currentSrc || image.src || image.getAttribute("src") || null;

    const findProfileImageUrl = (container, usernameAnchor) => {
      const username = normalizeSearch(usernameAnchor ? usernameAnchor.textContent || "" : "");
      const candidates = [];
      let current = usernameAnchor ? usernameAnchor.parentElement : container;

      for (let depth = 0; current && depth < 6; depth += 1) {
        const rect = current.getBoundingClientRect();
        if (rect.width > 900 || rect.height > 500) break;

        for (const image of Array.from(current.querySelectorAll("img[src]"))) {
          const src = imageSource(image);
          const imageRect = image.getBoundingClientRect();
          const alt = normalizeSearch(image.getAttribute("alt") || "");
          const isSmallAvatar = imageRect.width >= 18 && imageRect.width <= 96 && imageRect.height >= 18 && imageRect.height <= 96;
          const looksLikeProfile = !alt || alt.includes("perfil") || alt.includes("profile") || alt.includes(username);

          if (src && /^https?:\/\//.test(src) && isSmallAvatar && looksLikeProfile) {
            candidates.push({ src, area: imageRect.width * imageRect.height, depth });
          }
        }

        if (candidates.length > 0) break;
        if (current === container) break;
        current = current.parentElement;
      }

      return candidates.sort((a, b) => a.depth - b.depth || b.area - a.area)[0]?.src || null;
    };

    const isUiText = (value) => {
      const text = normalizeSearch(value);
      return (
        !text ||
        /^(curtir|responder|ver traducao|ocultar respostas|ver respostas|seguir|mais recente)$/.test(text) ||
        /^[0-9]+ curtida[s]?$/.test(text) ||
        /^[0-9]+ resposta[s]?$/.test(text) ||
        /^[0-9]+\s*(sem|semana|semanas|d|dia|dias|h|min)$/.test(text) ||
        text.includes("adicione um comentário") ||
        text.includes("add a comment") ||
        text.includes("posted a story") ||
        text.includes("sugestoes para voce")
      );
    };

    const comments = [];
    const seen = new Set();

    const pushComment = (comment) => {
      const username = normalizeText(comment.username || "").replace(/^@/, "");
      const text = normalizeText(comment.text || "");
      const key = [comment.instagramCommentId, comment.permalink, username.toLowerCase(), text.toLowerCase()].filter(Boolean).join("|");

      if (!username || !text || seen.has(key)) return;
      if (isUiText(text)) return;

      seen.add(key);
      comments.push({
        ...comment,
        username,
        text,
      });
    };

    const extractFromPermalink = (timeAnchor) => {
      const href = timeAnchor.getAttribute("href");
      const commentId = commentIdFromHref(href);
      if (!commentId) return;

      let container = timeAnchor.parentElement;
      let selected = null;

      for (let depth = 0; container && depth < 10; depth += 1) {
        const text = normalizeText(container.textContent || "");
        const anchors = Array.from(container.querySelectorAll("a[href]"));
        const hasTime = anchors.includes(timeAnchor);
        const hasResponder = /Responder|Reply/i.test(text);

        if (hasTime && anchors.length >= 2 && text.length <= 1200 && (hasResponder || depth >= 2)) {
          selected = container;
          break;
        }

        container = container.parentElement;
      }

      if (!selected) return;

      const anchors = Array.from(selected.querySelectorAll("a[href]"));
      const timeIndex = anchors.indexOf(timeAnchor);
      const usernameAnchor = anchors
        .slice(0, Math.max(timeIndex, 0))
        .reverse()
        .find((anchor) => {
          const username = usernameFromHref(anchor.getAttribute("href"));
          const label = normalizeText(anchor.textContent || "");
          return username && label && !label.startsWith("@") && !isUiText(label);
        });

      const username = usernameFromHref(usernameAnchor ? usernameAnchor.getAttribute("href") : null);
      if (!username) return;

      const timeNode = timeAnchor.querySelector("time") || selected.querySelector("time");
      const piecesAfterTime = [];
      const piecesBetweenUserAndTime = [];
      const walker = document.createTreeWalker(selected, NodeFilter.SHOW_TEXT);
      let afterTime = false;
      let afterUsername = false;

      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        const value = normalizeText(textNode.textContent || "");
        if (!value) continue;

        if (usernameAnchor && usernameAnchor.contains(textNode)) {
          afterUsername = true;
          continue;
        }

        if (timeAnchor.contains(textNode)) {
          afterTime = true;
          continue;
        }

        if (isUiText(value) || value === username) continue;

        const parentElement = textNode.parentElement;
        const parentLink = parentElement ? parentElement.closest("a[href]") : null;
        const parentHref = parentLink ? parentLink.getAttribute("href") : "";
        const parentUsername = usernameFromHref(parentHref);

        if (parentUsername && !value.startsWith("@")) continue;

        if (afterTime) {
          piecesAfterTime.push(value);
        } else if (afterUsername) {
          piecesBetweenUserAndTime.push(value);
        }
      }

      const text = normalizeText((piecesAfterTime.length > 0 ? piecesAfterTime : piecesBetweenUserAndTime).join(" "));
      if (!text) return;
      const profileImageUrl = findProfileImageUrl(selected, usernameAnchor);

      pushComment({
        username,
        text,
        instagramCommentId: commentId,
        permalink: href,
        commentedAt: timeNode ? timeNode.getAttribute("datetime") : null,
        profileImageUrl,
        rawData: {
          source: "comment permalink anchor",
          href,
          profileImageUrl,
        },
      });
    };

    const permalinkAnchors = Array.from(document.querySelectorAll('a[href*="/c/"]')).filter((anchor) =>
      isCommentPermalink(anchor.getAttribute("href"))
    );

    for (const timeAnchor of permalinkAnchors) {
      extractFromPermalink(timeAnchor);
    }

    const nodes = Array.from(document.querySelectorAll("article ul li"));

    for (const node of nodes) {
      if (node.querySelector('a[href*="/c/"]')) continue;

      const anchors = Array.from(node.querySelectorAll("a[href]"));
      const usernameAnchor = anchors.find((anchor) => usernameFromHref(anchor.getAttribute("href")));
      const username = usernameFromHref(usernameAnchor ? usernameAnchor.getAttribute("href") : null);
      const timeNode = node.querySelector("time");

      if (!username || !timeNode) continue;

      const spanTexts = Array.from(node.querySelectorAll("span"))
        .map((span) => normalizeText(span.textContent || ""))
        .filter(Boolean)
        .filter((text) => text !== username && !isUiText(text));

      const text = normalizeText(Array.from(new Set(spanTexts)).join(" "));
      if (!text) continue;
      const profileImageUrl = findProfileImageUrl(node, usernameAnchor);

      pushComment({
        username,
        text,
        commentedAt: timeNode.getAttribute("datetime"),
        profileImageUrl,
        rawData: {
          source: "article ul li fallback",
          href: usernameAnchor ? usernameAnchor.getAttribute("href") : null,
          profileImageUrl,
        },
      });
    }

    return comments;
    })()
  `);
}

function deduplicateComments(comments: ExtractedComment[]) {
  const seen = new Set<string>();
  const unique: ExtractedComment[] = [];

  for (const comment of comments) {
    const signature = getCommentDedupeKey(comment);
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
  if (error instanceof CaptureFailure) return true;
  if (!(error instanceof Error)) return false;

  return (
    error.message === captureMessages.unavailable ||
    error.message.includes("Instagram solicitou login") ||
    error.message.includes("verificação de segurança") ||
    error.message.includes("Informe a URL pública")
  );
}

async function captureUntilComplete(input: {
  page: Page;
  giveawayId: string;
  captureJobId: string;
  expectedCount: number | null;
  config: CaptureConfig;
}) {
  const collected = new Map<string, ExtractedComment>();
  const startedAt = Date.now();
  let previousCount = 0;
  let noGrowthRounds = 0;
  let stopReason = "max_iterations";
  let scrollContainer = await findCommentsScrollContainer(input.page);

  await appendCaptureLog(input.captureJobId, "Localizando painel de comentários...", {
    foundScrollableContainer: Boolean(scrollContainer),
  });

  for (let iteration = 0; iteration < input.config.maxIterations; iteration += 1) {
    const blocker = await detectInstagramBlockers(input.page);
    if (blocker) {
      await failCapture({
        giveawayId: input.giveawayId,
        captureJobId: input.captureJobId,
        message: blocker.message,
        status: blocker.status,
        details: {
          reason: blocker.reason,
          iteration,
          ...(await collectPageDiagnostics(input.page)),
        },
      });
    }

    const visibleComments = await extractVisibleComments(input.page);

    for (const comment of visibleComments) {
      collected.set(getCommentDedupeKey(comment), comment);
    }

    const currentCount = collected.size;

    await prisma.instagramCaptureJob.update({
      where: { id: input.captureJobId },
      data: {
        commentsFound: currentCount,
        currentStep: `Comentários únicos capturados até o momento: ${currentCount}.`,
      },
    });

    if (currentCount > previousCount) {
      previousCount = currentCount;
      noGrowthRounds = 0;
      await appendCaptureLog(input.captureJobId, `Comentários únicos capturados até o momento: ${currentCount}.`, {
        iteration: iteration + 1,
        expectedCount: input.expectedCount,
      });
    } else {
      noGrowthRounds += 1;
    }

    if (noGrowthRounds >= input.config.noGrowthLimit) {
      stopReason = "no_growth";
      await appendCaptureLog(
        input.captureJobId,
        `Nenhum novo comentário carregado após ${noGrowthRounds} tentativas.`,
        {
          iteration: iteration + 1,
          commentsFound: currentCount,
          expectedCount: input.expectedCount,
        },
      );
      break;
    }

    if (Date.now() - startedAt >= input.config.timeoutMs) {
      stopReason = "timeout";
      await appendCaptureLog(input.captureJobId, "Tempo limite global da captura atingido.", {
        commentsFound: currentCount,
        expectedCount: input.expectedCount,
        timeoutMs: input.config.timeoutMs,
      });
      break;
    }

    const clicked = await clickLoadMoreComments(input.page);
    if (clicked || iteration === 0 || (iteration + 1) % 10 === 0) {
      await appendCaptureLog(input.captureJobId, clicked ? "Carregando mais comentários..." : "Rolando painel de comentários...", {
        iteration: iteration + 1,
        clickedLoadMore: clicked,
        commentsFound: currentCount,
      });
    }

    if (!scrollContainer || iteration % 10 === 0) {
      scrollContainer = await findCommentsScrollContainer(input.page);
    }

    await scrollCommentsContainer(input.page, scrollContainer);
    await input.page.waitForTimeout(input.config.scrollDelayMs);
  }

  await scrollContainer?.dispose().catch(() => undefined);

  return {
    comments: deduplicateComments(Array.from(collected.values())),
    stopReason,
    noGrowthRounds,
  };
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
      message: "Informe a URL pública de uma publicação do Instagram.",
    });
  }

  const config = getCaptureConfig();
  const authStatePath = resolveAuthStatePath();
  const hasAuthState = fs.existsSync(authStatePath);

  if (!hasAuthState) {
    await failCapture({
      giveawayId: input.giveawayId,
      captureJobId: input.captureJobId,
      status: "blocked",
      message:
        "Login do Instagram obrigatório. Execute o login manual para salvar a sessão antes de iniciar a captura.",
      details: {
        authStatePath,
        authenticated: false,
      },
    });
  }

  const openingMessage = hasAuthState
    ? "Acessando publicação com sessão autenticada..."
    : "Acessando publicação sem sessão autenticada...";

  await prisma.instagramCaptureJob.update({
    where: { id: input.captureJobId },
    data: {
      status: "running",
      startedAt: new Date(),
      currentStep: openingMessage,
    },
  });

  await prisma.giveaway.update({
    where: { id: input.giveawayId },
    data: { status: "capturing" },
  });

  await registerAuditLog({
    giveawayId: input.giveawayId,
    action: "capture_started",
    payload: { postUrl: input.postUrl, captureJobId: input.captureJobId, authenticated: hasAuthState },
  });

  let browser;
  let page: Page | undefined;

  try {
    await appendCaptureLog(input.captureJobId, openingMessage, {
      authenticated: hasAuthState,
      authStatePath: hasAuthState ? authStatePath : null,
      config: config as unknown as Prisma.InputJsonObject,
    });

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      storageState: hasAuthState ? authStatePath : undefined,
      locale: "pt-BR",
      viewport: { width: 1280, height: 900 },
    });
    page = await context.newPage();

    await page.goto(input.postUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    const initialBlocker = await detectInstagramBlockers(page);
    if (initialBlocker) {
      await failCapture({
        giveawayId: input.giveawayId,
        captureJobId: input.captureJobId,
        message: initialBlocker.message,
        status: initialBlocker.status,
        details: {
          reason: initialBlocker.reason,
          authenticated: hasAuthState,
          ...(await collectPageDiagnostics(page)),
        },
      });
    }

    await appendCaptureLog(input.captureJobId, "Identificando total estimado de comentários...");
    const expectedCount = await extractExpectedCommentCount(page);

    await prisma.instagramCaptureJob.update({
      where: { id: input.captureJobId },
      data: {
        expectedCommentsCount: expectedCount,
        currentStep: expectedCount
          ? `Total informado na publicação: ${expectedCount} comentários.`
          : "Total informado na publicação não identificado.",
      },
    });

    await appendCaptureLog(
      input.captureJobId,
      expectedCount
        ? `Total informado na publicação: ${expectedCount} comentários.`
        : "Total informado na publicação não identificado.",
      {
        expectedCommentsCount: expectedCount,
      },
    );

    await page.waitForTimeout(1500);

    const captureResult = await captureUntilComplete({
      page,
      giveawayId: input.giveawayId,
      captureJobId: input.captureJobId,
      expectedCount,
      config,
    });

    const uniqueComments = captureResult.comments;

    if (uniqueComments.length === 0) {
      await failCapture({
        giveawayId: input.giveawayId,
        captureJobId: input.captureJobId,
        message: captureMessages.unavailable,
        details: {
          ...(await collectPageDiagnostics(page)),
          expectedCommentsCount: expectedCount,
          stopReason: captureResult.stopReason,
          possibleCause:
            "A estrutura do Instagram pode ter mudado, os comentários podem não estar carregáveis ou a publicação pode exigir verificação.",
          commentsExtractedBeforeSave: 0,
        },
      });
    }

    await appendCaptureLog(input.captureJobId, captureMessages.dedupe, {
      totalUniqueComments: uniqueComments.length,
      stopReason: captureResult.stopReason,
    });

    await appendCaptureLog(input.captureJobId, captureMessages.saving, {
      total: uniqueComments.length,
    });

    await prisma.comment.createMany({
      data: uniqueComments.map((comment) => ({
        giveawayId: input.giveawayId,
        username: comment.username,
        text: comment.text,
        instagramCommentId: comment.instagramCommentId ?? createCommentSignature(comment),
        commentedAt: parseCommentedAt(comment.commentedAt),
        rawData: {
          ...(comment.rawData ?? {}),
          permalink: comment.permalink ?? null,
          dedupeKey: getCommentDedupeKey(comment),
          profileImageUrl: comment.profileImageUrl ?? comment.rawData?.profileImageUrl ?? null,
        },
      })),
      skipDuplicates: true,
    });

    const commentsSaved = await prisma.comment.count({
      where: { giveawayId: input.giveawayId },
    });

    const isPartial = Boolean(expectedCount && commentsSaved < expectedCount);
    const warningMessage = isPartial
      ? `Captura parcial: foram capturados ${commentsSaved} de ${expectedCount} comentários. O Instagram não carregou novos comentários após várias tentativas.`
      : null;

    await prisma.instagramCaptureJob.update({
      where: { id: input.captureJobId },
      data: {
        status: isPartial ? "partial_completed" : "completed",
        finishedAt: new Date(),
        commentsFound: uniqueComments.length,
        commentsSaved,
        warningMessage,
        currentStep: isPartial ? `Captura parcial concluída: ${commentsSaved} de ${expectedCount} comentários.` : captureMessages.completed,
      },
    });

    await prisma.giveaway.update({
      where: { id: input.giveawayId },
      data: {
        status: "captured",
        capturedAt: new Date(),
      },
    });

    await appendCaptureLog(input.captureJobId, isPartial ? "Captura parcial concluída." : captureMessages.completed, {
      commentsSaved,
      expectedCommentsCount: expectedCount,
      stopReason: captureResult.stopReason,
      noGrowthRounds: captureResult.noGrowthRounds,
      warningMessage,
    });

    await registerAuditLog({
      giveawayId: input.giveawayId,
      action: isPartial ? "capture_partial_completed" : "capture_completed",
      payload: {
        commentsFound: uniqueComments.length,
        commentsSaved,
        expectedCommentsCount: expectedCount,
        warningMessage,
        stopReason: captureResult.stopReason,
        captureJobId: input.captureJobId,
      },
    });

    return {
      commentsFound: uniqueComments.length,
      commentsSaved,
      expectedCommentsCount: expectedCount,
      partial: isPartial,
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
