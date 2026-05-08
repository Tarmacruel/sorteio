import Link from "next/link";
import { AlertCircle, Plus, RefreshCcw } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Metric } from "@/components/metric";

export const dynamic = "force-dynamic";

async function getGiveaways() {
  const giveaways = await prisma.giveaway.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      captureJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: { comments: true },
      },
    },
  });

  return Promise.all(
    giveaways.map(async (giveaway) => {
      const [valid, invalid] = await Promise.all([
        prisma.comment.count({ where: { giveawayId: giveaway.id, isValid: true } }),
        prisma.comment.count({ where: { giveawayId: giveaway.id, invalidReason: { not: null } } }),
      ]);

      return {
        ...giveaway,
        valid,
        invalid,
      };
    }),
  );
}

export default async function DashboardPage() {
  let giveaways: Awaited<ReturnType<typeof getGiveaways>> = [];
  let error: string | null = null;

  try {
    giveaways = await getGiveaways();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Nao foi possivel conectar ao banco.";
  }

  const totals = giveaways.reduce(
    (acc, giveaway) => {
      acc.comments += giveaway._count.comments;
      acc.valid += giveaway.valid;
      acc.invalid += giveaway.invalid;
      if (giveaway.status === "drawn") acc.drawn += 1;
      return acc;
    },
    { comments: 0, valid: 0, invalid: 0, drawn: 0 },
  );

  return (
    <main className="container py-8">
      <div className="flex flex-col justify-between gap-4 border-b pb-6 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-primary">Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">Sorteios</h1>
          <p className="mt-2 text-muted-foreground">Acompanhe captura, validacao, sorteio e auditoria em um unico lugar.</p>
        </div>
        <Button asChild>
          <Link href="/sorteios/novo">
            <Plus className="size-4" />
            Novo Sorteio
          </Link>
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle className="size-4" />
          <AlertTitle>Banco indisponivel</AlertTitle>
          <AlertDescription>
            Verifique se PostgreSQL e Redis locais estao em execucao, configure `DATABASE_URL` e execute as migracoes Prisma.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-8 grid gap-6 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <Metric label="sorteios" value={giveaways.length} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric label="comentarios" value={totals.comments} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric label="validos" value={totals.valid} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric label="sorteados" value={totals.drawn} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Lista de sorteios</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">
              <RefreshCcw className="size-4" />
              Atualizar
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {giveaways.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-md border border-dashed text-center">
              <p className="font-medium">Nenhum sorteio criado ainda.</p>
              <p className="mt-2 text-sm text-muted-foreground">Comece informando a URL publica da postagem do Instagram.</p>
              <Button asChild className="mt-5">
                <Link href="/sorteios/novo">Criar sorteio</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titulo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Captura</TableHead>
                  <TableHead className="text-right">Capturados</TableHead>
                  <TableHead className="text-right">Validos</TableHead>
                  <TableHead className="text-right">Excluidos</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {giveaways.map((giveaway) => {
                  const latestCapture = giveaway.captureJobs[0];
                  return (
                    <TableRow key={giveaway.id}>
                      <TableCell>
                        <div className="font-medium">{giveaway.title}</div>
                        <div className="max-w-xs truncate text-xs text-muted-foreground">{giveaway.instagramPostUrl}</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={giveaway.status} />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {latestCapture?.currentStep ?? "Sem captura"}
                        </div>
                        {latestCapture?.expectedCommentsCount ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {giveaway._count.comments}/{latestCapture.expectedCommentsCount} comentarios
                          </div>
                        ) : null}
                        {latestCapture?.warningMessage ? (
                          <div className="mt-1 max-w-sm text-xs font-medium text-amber-700">
                            {latestCapture.warningMessage}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">{giveaway._count.comments}</TableCell>
                      <TableCell className="text-right">{giveaway.valid}</TableCell>
                      <TableCell className="text-right">{giveaway.invalid}</TableCell>
                      <TableCell>{formatDateTime(giveaway.createdAt)}</TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/sorteios/${giveaway.id}/captura`}>Captura</Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/resultado/${giveaway.id}`}>Resultado</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
