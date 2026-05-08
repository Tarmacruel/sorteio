import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createGiveawaySchema } from "@/schemas/giveaway.schema";
import { registerAuditLog } from "@/services/audit.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const giveaways = await prisma.giveaway.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          comments: true,
          drawResults: true,
        },
      },
    },
  });

  return NextResponse.json({ giveaways });
}

export async function POST(request: Request) {
  try {
    const payload = createGiveawaySchema.parse(await request.json());

    const giveaway = await prisma.giveaway.create({
      data: {
        title: payload.title,
        instagramPostUrl: payload.instagramPostUrl,
        organizerUsername: payload.organizerUsername,
        description: payload.description,
        winnersCount: payload.winnersCount,
        alternatesCount: payload.alternatesCount,
        oneChancePerUser: payload.oneChancePerUser,
        allowMultipleEntries: payload.allowMultipleEntries,
        commentDeadline: payload.commentDeadline,
        status: "draft",
      },
    });

    await registerAuditLog({
      giveawayId: giveaway.id,
      action: "giveaway_created",
      payload: {
        title: giveaway.title,
        instagramPostUrl: giveaway.instagramPostUrl,
      },
    });

    return NextResponse.json({ giveaway }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel criar o sorteio." },
      { status: 400 },
    );
  }
}
