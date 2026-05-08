import { NextResponse } from "next/server";
import { drawGiveaway } from "@/services/draw.service";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const result = await drawGiveaway(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel realizar o sorteio." },
      { status: 400 },
    );
  }
}
