import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function registerAuditLog(input: {
  giveawayId: string;
  action: string;
  payload?: unknown;
}) {
  return prisma.auditLog.create({
    data: {
      giveawayId: input.giveawayId,
      action: input.action,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
    },
  });
}
