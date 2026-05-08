import { NextResponse } from "next/server";
import { validateGiveawayComments } from "@/services/rule-validation.service";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const result = await validateGiveawayComments(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível validar os comentários." },
      { status: 400 },
    );
  }
}
