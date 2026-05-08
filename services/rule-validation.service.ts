import type { Comment, GiveawayRule } from "@prisma/client";
import { prisma } from "@/lib/db";
import { extractMentions } from "@/lib/instagram";
import { normalizeUsername } from "@/lib/utils";
import { invalidReasons, type InvalidReasonCode, type RuleConfig, type RuleType } from "@/types/giveaway";
import { registerAuditLog } from "@/services/audit.service";

type RuleMap = Partial<Record<RuleType, GiveawayRule>>;

function toConfig(rule?: GiveawayRule): RuleConfig {
  return (rule?.config ?? {}) as RuleConfig;
}

function isEnabled(rules: RuleMap, type: RuleType) {
  return Boolean(rules[type]?.enabled);
}

function lowerList(values?: string[]) {
  return (values ?? []).map((value) => normalizeUsername(value));
}

function getInvalidReason(input: {
  comment: Comment;
  rules: RuleMap;
  organizerUsername: string;
  commentDeadline?: Date | null;
  duplicateKeys: Set<string>;
}): InvalidReasonCode | null {
  const text = input.comment.text.trim();
  const lowerText = text.toLowerCase();
  const username = normalizeUsername(input.comment.username);

  if (!text) return "empty_comment";

  if (isEnabled(input.rules, "min_length")) {
    const minLength = Number(toConfig(input.rules.min_length).minLength ?? 3);
    if (text.length < minLength) return "too_short";
  }

  if (input.commentDeadline && input.comment.commentedAt && input.comment.commentedAt > input.commentDeadline) {
    return "after_deadline";
  }

  if (isEnabled(input.rules, "exclude_organizer")) {
    if (username === normalizeUsername(input.organizerUsername)) return "organizer_not_allowed";
  }

  if (isEnabled(input.rules, "blocked_users")) {
    const blockedUsers = lowerList(toConfig(input.rules.blocked_users).usernames);
    if (blockedUsers.includes(username)) return "blocked_user";
  }

  if (isEnabled(input.rules, "allowed_users")) {
    const allowedUsers = lowerList(toConfig(input.rules.allowed_users).usernames);
    if (allowedUsers.length > 0 && !allowedUsers.includes(username)) return "not_allowed_user";
  }

  if (isEnabled(input.rules, "required_phrase")) {
    const phrase = String(toConfig(input.rules.required_phrase).phrase ?? "").trim().toLowerCase();
    if (phrase && !lowerText.includes(phrase)) return "required_phrase_missing";
  }

  if (isEnabled(input.rules, "required_hashtag")) {
    const rawHashtag = String(toConfig(input.rules.required_hashtag).hashtag ?? "").trim().toLowerCase();
    const hashtag = rawHashtag.startsWith("#") ? rawHashtag : `#${rawHashtag}`;
    if (rawHashtag && !lowerText.includes(hashtag)) return "required_hashtag_missing";
  }

  const mentions = extractMentions(text);

  if (isEnabled(input.rules, "require_mention") && mentions.length === 0) {
    return "mention_required";
  }

  if (isEnabled(input.rules, "min_mentions")) {
    const minMentions = Number(toConfig(input.rules.min_mentions).min ?? 1);
    if (mentions.length < minMentions) return "min_mentions_not_reached";
  }

  if (isEnabled(input.rules, "forbidden_words")) {
    const forbiddenWords = (toConfig(input.rules.forbidden_words).words ?? []).map((word) =>
      word.trim().toLowerCase(),
    );
    if (forbiddenWords.some((word) => word && lowerText.includes(word))) return "forbidden_word";
  }

  if (isEnabled(input.rules, "ignore_duplicates")) {
    const duplicateKey = `${username}|${lowerText}`;
    if (input.duplicateKeys.has(duplicateKey)) return "duplicate_comment";
    input.duplicateKeys.add(duplicateKey);
  }

  return null;
}

export async function validateGiveawayComments(giveawayId: string) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    include: {
      rules: true,
      comments: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!giveaway) {
    throw new Error("Sorteio nao encontrado.");
  }

  await prisma.giveaway.update({
    where: { id: giveawayId },
    data: { status: "validating" },
  });

  const rules = giveaway.rules.reduce<RuleMap>((acc, rule) => {
    acc[rule.type as RuleType] = rule;
    return acc;
  }, {});

  const duplicateKeys = new Set<string>();
  let valid = 0;
  let invalid = 0;

  for (const comment of giveaway.comments) {
    const reasonCode = getInvalidReason({
      comment,
      rules,
      organizerUsername: giveaway.organizerUsername,
      commentDeadline: giveaway.commentDeadline,
      duplicateKeys,
    });

    if (reasonCode) {
      invalid += 1;
    } else {
      valid += 1;
    }

    await prisma.comment.update({
      where: { id: comment.id },
      data: {
        isValid: !reasonCode,
        invalidReason: reasonCode ? invalidReasons[reasonCode] : null,
      },
    });
  }

  await prisma.giveaway.update({
    where: { id: giveawayId },
    data: { status: "ready_to_draw" },
  });

  await registerAuditLog({
    giveawayId,
    action: "comments_validated",
    payload: {
      valid,
      invalid,
      total: giveaway.comments.length,
    },
  });

  return {
    total: giveaway.comments.length,
    valid,
    invalid,
  };
}
