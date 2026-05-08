import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const giveaway = await prisma.giveaway.findUnique({
    where: { id },
    include: {
      rules: {
        orderBy: { type: "asc" },
      },
      drawResults: {
        orderBy: [{ type: "desc" }, { position: "asc" }],
        include: {
          comment: true,
        },
      },
      captureJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      auditLogs: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!giveaway) {
    return NextResponse.json({ error: "Resultado nao encontrado." }, { status: 404 });
  }

  const [captured, valid, invalid] = await Promise.all([
    prisma.comment.count({ where: { giveawayId: id } }),
    prisma.comment.count({ where: { giveawayId: id, isValid: true } }),
    prisma.comment.count({ where: { giveawayId: id, invalidReason: { not: null } } }),
  ]);

  return NextResponse.json({
    giveaway,
    totals: {
      captured,
      valid,
      invalid,
    },
  });
}
