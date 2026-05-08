import crypto from "node:crypto";

export function validateInstagramPostUrl(postUrl: string) {
  try {
    const url = new URL(postUrl);
    if (!["instagram.com", "www.instagram.com"].includes(url.hostname)) {
      return false;
    }

    return /^\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?/.test(url.pathname);
  } catch {
    return false;
  }
}

export function createCommentSignature(input: {
  username: string;
  text: string;
  commentedAt?: string | null;
}) {
  return crypto
    .createHash("sha256")
    .update(`${input.username.toLowerCase()}|${input.text.trim()}|${input.commentedAt ?? ""}`)
    .digest("hex");
}

export function extractMentions(text: string) {
  return text.match(/@[A-Za-z0-9._]+/g) ?? [];
}
