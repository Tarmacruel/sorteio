import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const validity = searchParams.get("valid");
  const parsedTake = Number(searchParams.get("take") ?? 100);
  const take = Math.min(Number.isFinite(parsedTake) && parsedTake > 0 ? parsedTake : 100, 5000);

  const where = {
    giveawayId: id,
    ...(validity === "true" ? { isValid: true } : {}),
    ...(validity === "false" ? { invalidReason: { not: null } } : {}),
  };

  const [comments, total, valid, invalid, uniqueUsers, duplicateGroups] = await Promise.all([
    prisma.comment.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
    }),
    prisma.comment.count({ where: { giveawayId: id } }),
    prisma.comment.count({ where: { giveawayId: id, isValid: true } }),
    prisma.comment.count({ where: { giveawayId: id, invalidReason: { not: null } } }),
    prisma.comment.groupBy({ by: ["username"], where: { giveawayId: id } }),
    prisma.comment.groupBy({
      by: ["username", "text"],
      where: { giveawayId: id },
      _count: { id: true },
      having: {
        id: {
          _count: {
            gt: 1,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    comments,
    stats: {
      total,
      valid,
      invalid,
      uniqueUsers: uniqueUsers.length,
      duplicates: duplicateGroups.length,
    },
  });
}
