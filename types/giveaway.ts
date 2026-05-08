export const giveawayStatuses = [
  "draft",
  "ready_to_capture",
  "capturing",
  "captured",
  "validating",
  "ready_to_draw",
  "drawn",
  "capture_failed",
] as const;

export type GiveawayStatus = (typeof giveawayStatuses)[number];

export const captureStatuses = [
  "queued",
  "running",
  "completed",
  "partial_completed",
  "failed",
  "blocked",
  "cancelled",
] as const;

export type CaptureStatus = (typeof captureStatuses)[number];

export const ruleTypes = [
  "required_phrase",
  "required_hashtag",
  "min_mentions",
  "require_mention",
  "forbidden_words",
  "blocked_users",
  "allowed_users",
  "exclude_organizer",
  "ignore_duplicates",
  "min_length",
] as const;

export type RuleType = (typeof ruleTypes)[number];

export const invalidReasons = {
  empty_comment: "comentário vazio",
  too_short: "comentário muito curto",
  required_phrase_missing: "palavra obrigatória ausente",
  required_hashtag_missing: "hashtag obrigatória ausente",
  mention_required: "marcação obrigatória ausente",
  min_mentions_not_reached: "quantidade mínima de marcações não atingida",
  blocked_user: "usuário bloqueado",
  forbidden_word: "palavra proibida",
  not_allowed_user: "usuário não autorizado",
  duplicate_comment: "comentário duplicado",
  organizer_not_allowed: "perfil organizador não pode participar",
  after_deadline: "comentário fora do prazo",
} as const;

export type InvalidReasonCode = keyof typeof invalidReasons;

export type RuleConfig = {
  phrase?: string;
  hashtag?: string;
  min?: number;
  words?: string[];
  usernames?: string[];
  minLength?: number;
};

export type PublicAuditStatus = "verified" | "incomplete" | "capture_failed";
