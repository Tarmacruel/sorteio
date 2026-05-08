import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { updateRulesSchema } from "@/schemas/giveaway.schema";
import { registerAuditLog } from "@/services/audit.service";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const payload = updateRulesSchema.parse(await request.json());

    const giveaway = await prisma.giveaway.findUnique({ where: { id } });
    if (!giveaway) {
      return NextResponse.json({ error: "Sorteio não encontrado." }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      for (const rule of payload.rules) {
        await tx.giveawayRule.upsert({
          where: {
            giveawayId_type: {
              giveawayId: id,
              type: rule.type,
            },
          },
          update: {
            enabled: rule.enabled,
            config: rule.config as Prisma.InputJsonObject,
          },
          create: {
            giveawayId: id,
            type: rule.type,
            enabled: rule.enabled,
            config: rule.config as Prisma.InputJsonObject,
          },
        });
      }

      await tx.giveaway.update({
        where: { id },
        data: {
          status: "ready_to_capture",
        },
      });
    });

    await registerAuditLog({
      giveawayId: id,
      action: "rules_updated",
      payload: {
        rules: payload.rules,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível atualizar as regras." },
      { status: 400 },
    );
  }
}
