import Link from "next/link";
import { AlertTriangle, Download, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { ruleLabels } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Metric } from "@/components/metric";
import type { RuleType } from "@/types/giveaway";

export const dynamic = "force-dynamic";

export default async function PublicResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const giveaway = await prisma.giveaway.findUnique({
    where: { id },
    include: {
      rules: {
        orderBy: { type: "asc" },
      },
      drawResults: {
        orderBy: [{ type: "desc" }, { position: "asc" }],
        include: { comment: true },
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
    return (
      <main className="container py-10">
        <h1 className="text-2xl font-semibold">Resultado nao encontrado</h1>
        <Button asChild className="mt-4">
          <Link href="/">Voltar</Link>
        </Button>
      </main>
    );
  }

  const [captured, valid, invalid] = await Promise.all([
    prisma.comment.count({ where: { giveawayId: id } }),
    prisma.comment.count({ where: { giveawayId: id, isValid: true } }),
    prisma.comment.count({ where: { giveawayId: id, invalidReason: { not: null } } }),
  ]);

  const winners = giveaway.drawResults.filter((result) => result.type === "winner");
  const alternates = giveaway.drawResults.filter((result) => result.type === "alternate");
  const latestCapture = giveaway.captureJobs[0];
  const auditStatus =
    giveaway.status === "capture_failed"
      ? "capture_failed"
      : giveaway.drawSeed && giveaway.participantsHash && giveaway.drawnAt
        ? "verified"
        : "incomplete";

  return (
    <main>
      <section className="border-b bg-white">
        <div className="container py-10">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-semibold uppercase text-primary">Resultado publico</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-normal">{giveaway.title}</h1>
              <p className="mt-3 max-w-3xl break-all text-muted-foreground">{giveaway.instagramPostUrl}</p>
            </div>
            <Badge variant={auditStatus === "verified" ? "default" : auditStatus === "capture_failed" ? "destructive" : "outline"}>
              {auditStatus === "verified" ? "Auditoria verificada" : auditStatus === "capture_failed" ? "Captura falhou" : "Auditoria incompleta"}
            </Badge>
          </div>
        </div>
      </section>

      <section className="container py-8">
        {auditStatus === "capture_failed" ? (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="size-4" />
            <AlertTitle>Captura nao concluida</AlertTitle>
            <AlertDescription>
              {latestCapture?.errorMessage ?? "Nao foi possivel capturar comentarios publicamente disponiveis desta postagem."}
            </AlertDescription>
          </Alert>
        ) : null}

        {latestCapture?.warningMessage ? (
          <Alert className="mb-6">
            <AlertTriangle className="size-4" />
            <AlertTitle>Captura parcial</AlertTitle>
            <AlertDescription>{latestCapture.warningMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <Metric label="capturados" value={captured} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Metric label="participantes validos" value={valid} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Metric label="comentarios invalidos" value={invalid} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Metric label="eventos de auditoria" value={giveaway.auditLogs.length} />
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardHeader>
              <CardTitle>Vencedores</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Posicao</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Comentario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {winners.map((winner) => (
                    <TableRow key={winner.id}>
                      <TableCell>{winner.position}</TableCell>
                      <TableCell className="font-medium">@{winner.username}</TableCell>
                      <TableCell className="max-w-xl">
                        <span className="line-clamp-2">{winner.comment.text}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {winners.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Sorteio ainda nao realizado.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dados auditaveis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="text-muted-foreground">Capturado em</div>
                <div className="font-medium">{formatDateTime(giveaway.capturedAt)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Sorteado em</div>
                <div className="font-medium">{formatDateTime(giveaway.drawnAt)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Seed do sorteio</div>
                <div className="break-all rounded-md bg-muted p-2 font-mono text-xs">{giveaway.drawSeed ?? "Nao gerada"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Hash da lista de participantes</div>
                <div className="break-all rounded-md bg-muted p-2 font-mono text-xs">{giveaway.participantsHash ?? "Nao gerado"}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {alternates.length > 0 ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Suplentes</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Posicao</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Comentario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alternates.map((alternate) => (
                    <TableRow key={alternate.id}>
                      <TableCell>{alternate.position}</TableCell>
                      <TableCell className="font-medium">@{alternate.username}</TableCell>
                      <TableCell className="max-w-xl">
                        <span className="line-clamp-2">{alternate.comment.text}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Regras aplicadas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {giveaway.rules.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma regra configurada.</p>
              ) : (
                giveaway.rules.map((rule) => (
                  <div key={rule.id} className="flex items-start justify-between gap-4 border-b pb-3 last:border-0">
                    <div>
                      <div className="font-medium">{ruleLabels[rule.type as RuleType] ?? rule.type}</div>
                      <pre className="mt-1 whitespace-pre-wrap break-all text-xs text-muted-foreground">
                        {JSON.stringify(rule.config, null, 2)}
                      </pre>
                    </div>
                    <Badge variant={rule.enabled ? "default" : "outline"}>{rule.enabled ? "ativa" : "inativa"}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exportacoes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {[
                ["resultado-json", "Resultado em JSON"],
                ["participantes-validos-csv", "Participantes validos em CSV"],
                ["comentarios-invalidos-csv", "Comentarios invalidos em CSV"],
                ["relatorio-tecnico-json", "Relatorio tecnico em JSON"],
              ].map(([type, label]) => (
                <Button key={type} asChild variant="outline" className="justify-start">
                  <a href={`/api/results/${id}/export/${type}`}>
                    <Download className="size-4" />
                    {label}
                  </a>
                </Button>
              ))}
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Exportacao em PDF preparada para fase futura.
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Trilha de auditoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {giveaway.auditLogs.map((log) => (
                <div key={log.id} className="flex gap-3 border-l-2 border-primary/35 pl-3">
                  <ShieldCheck className="mt-0.5 size-4 text-primary" />
                  <div>
                    <div className="font-medium">{log.action}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
