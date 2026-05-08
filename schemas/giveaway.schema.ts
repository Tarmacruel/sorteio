import { z } from "zod";
import { ruleTypes } from "@/types/giveaway";

export const instagramPostUrlSchema = z
  .string()
  .url("Informe uma URL valida.")
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["instagram.com", "www.instagram.com"].includes(url.hostname) &&
        /^\/(p|reel|tv)\//.test(url.pathname)
      );
    } catch {
      return false;
    }
  }, "Informe a URL pública de uma publicação, Reel ou IGTV do Instagram.");

export const createGiveawaySchema = z.object({
  title: z.string().min(3).max(120),
  instagramPostUrl: instagramPostUrlSchema,
  organizerUsername: z.string().min(2).max(60),
  description: z.string().max(1200).optional().nullable(),
  winnersCount: z.coerce.number().int().min(1).max(100),
  alternatesCount: z.coerce.number().int().min(0).max(100),
  oneChancePerUser: z.coerce.boolean().default(true),
  allowMultipleEntries: z.coerce.boolean().default(false),
  commentDeadline: z
    .string()
    .optional()
    .nullable()
    .transform((value) => (value ? new Date(value) : null)),
});

export const ruleSchema = z.object({
  type: z.enum(ruleTypes),
  enabled: z.boolean(),
  config: z.record(z.unknown()).default({}),
});

export const updateRulesSchema = z.object({
  rules: z.array(ruleSchema),
});

export type CreateGiveawayInput = z.infer<typeof createGiveawaySchema>;
export type UpdateRulesInput = z.infer<typeof updateRulesSchema>;
