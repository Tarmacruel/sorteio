import Link from "next/link";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { CaptureStatusPanel } from "@/components/capture-status-panel";

export const dynamic = "force-dynamic";

export default async function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const giveaway = await prisma.giveaway.findUnique({
    where: { id },
    select: {
      title: true,
      instagramPostUrl: true,
    },
  });

  if (!giveaway) {
    return (
      <main className="container py-10">
        <h1 className="text-2xl font-semibold">Sorteio não encontrado</h1>
        <Button asChild className="mt-4">
          <Link href="/dashboard">Voltar ao dashboard</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="container py-8">
      <div className="mb-8 flex flex-col justify-between gap-4 border-b pb-6 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-primary">Captura automática</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">{giveaway.title}</h1>
          <p className="mt-2 max-w-3xl truncate text-muted-foreground">{giveaway.instagramPostUrl}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
      </div>
      <CaptureStatusPanel giveawayId={id} />
    </main>
  );
}
