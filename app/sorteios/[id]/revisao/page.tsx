import Link from "next/link";
import { prisma } from "@/lib/db";
import { validateGiveawayComments } from "@/services/rule-validation.service";
import { Button } from "@/components/ui/button";
import { ReviewComments } from "@/components/review-comments";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const giveaway = await prisma.giveaway.findUnique({
    where: { id },
    select: {
      title: true,
      status: true,
    },
  });

  if (!giveaway) {
    return (
      <main className="container py-10">
        <h1 className="text-2xl font-semibold">Sorteio nao encontrado</h1>
        <Button asChild className="mt-4">
          <Link href="/dashboard">Voltar ao dashboard</Link>
        </Button>
      </main>
    );
  }

  if (giveaway.status === "captured") {
    await validateGiveawayComments(id);
  }

  return (
    <main className="container py-8">
      <div className="mb-8 flex flex-col justify-between gap-4 border-b pb-6 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-primary">Revisao</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">{giveaway.title}</h1>
          <p className="mt-2 text-muted-foreground">Confira participantes validos e comentarios excluidos antes do sorteio.</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/sorteios/${id}/captura`}>Voltar para captura</Link>
        </Button>
      </div>
      <ReviewComments giveawayId={id} />
    </main>
  );
}
