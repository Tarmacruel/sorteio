import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const giveaway = await prisma.giveaway.findUnique({
    where: { id },
    include: {
      rules: true,
      captureJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      drawResults: {
        orderBy: [{ type: "desc" }, { position: "asc" }],
      },
      _count: {
        select: {
          comments: true,
        },
      },
    },
  });

  if (!giveaway) {
    return NextResponse.json({ error: "Sorteio nao encontrado." }, { status: 404 });
  }

  const [validComments, invalidComments, uniqueUsers] = await Promise.all([
    prisma.comment.count({ where: { giveawayId: id, isValid: true } }),
    prisma.comment.count({ where: { giveawayId: id, invalidReason: { not: null } } }),
    prisma.comment.groupBy({ by: ["username"], where: { giveawayId: id } }),
  ]);

  return NextResponse.json({
    giveaway,
    stats: {
      totalComments: giveaway._count.comments,
      validComments,
      invalidComments,
      uniqueUsers: uniqueUsers.length,
    },
  });
}
