"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, AlertCircle, Ban, CheckCircle2, Clock3, Loader2, Play, RefreshCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Metric } from "@/components/metric";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";

type CaptureLog = {
  at: string;
  message: string;
};

type CaptureState = {
  job: {
    id: string;
    status: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    errorMessage?: string | null;
    commentsFound: number;
    commentsSaved: number;
    currentStep: string;
    logs: CaptureLog[];
  } | null;
  giveaway: {
    status: string;
    capturedAt?: string | null;
    instagramPostUrl: string;
  } | null;
  stats: {
    captured: number;
    valid: number;
    invalid: number;
  };
};

function formatElapsedTime(startedAt?: string | null, finishedAt?: string | null, now = Date.now()) {
  if (!startedAt) return "Aguardando inicio";

  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : now;

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "Aguardando inicio";

  const totalSeconds = Math.floor((end - start) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function CaptureStatusPanel({ giveawayId }: { giveawayId: string }) {
  const { toast } = useToast();
  const [state, setState] = React.useState<CaptureState | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isMutating, setIsMutating] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  const load = React.useCallback(async () => {
    const response = await fetch(`/api/giveaways/${giveawayId}/capture`, { cache: "no-store" });
    const data = (await response.json()) as CaptureState;
    setState(data);
    setIsLoading(false);
  }, [giveawayId]);

  React.useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 2500);
    return () => window.clearInterval(interval);
  }, [load]);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  async function startCapture() {
    setIsMutating(true);
    const response = await fetch(`/api/giveaways/${giveawayId}/capture`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setIsMutating(false);

    if (!response.ok) {
      toast({ title: "Captura nao iniciada", description: data.error });
      return;
    }

    toast({ title: "Captura enfileirada", description: "O worker Playwright assumira o job." });
    await load();
  }

  async function cancelCapture() {
    setIsMutating(true);
    const response = await fetch(`/api/giveaways/${giveawayId}/capture`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setIsMutating(false);

    if (!response.ok) {
      toast({ title: "Cancelamento nao realizado", description: data.error });
      return;
    }

    toast({ title: "Captura cancelada" });
    await load();
  }

  const job = state?.job;
  const rawLogs = Array.isArray(job?.logs) ? job.logs : [];
  const logs = rawLogs.slice(-8).reverse();
  const latestLog = rawLogs.at(-1);
  const isActive = job?.status === "queued" || job?.status === "running";
  const isCompleted = job?.status === "completed";
  const isFailed = job?.status === "failed" || state?.giveaway?.status === "capture_failed";
  const isCancelled = job?.status === "cancelled";
  const capturedCount = Math.max(state?.stats.captured ?? 0, job?.commentsFound ?? 0, job?.commentsSaved ?? 0);
  const activeStep = job?.status === "queued" ? "Aguardando worker iniciar..." : job?.currentStep;
  const elapsedTime = formatElapsedTime(job?.startedAt, job?.finishedAt, now);
  const lastUpdatedAt = latestLog?.at ?? job?.startedAt ?? job?.finishedAt ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Status da captura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando status...
            </div>
          ) : null}

          {!job && !isLoading ? (
            <Alert>
              <Play className="size-4" />
              <AlertTitle>Nenhuma captura iniciada</AlertTitle>
              <AlertDescription>
                Inicie a captura automatica para que o worker acesse a postagem e salve comentarios publicos.
              </AlertDescription>
            </Alert>
          ) : null}

          {job ? (
            <div className="space-y-5">
              {isActive ? (
                <div className="sticky top-20 z-10 overflow-hidden rounded-md border border-primary/20 bg-primary text-primary-foreground shadow-sm">
                  <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="relative mt-1 flex size-3">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/70 opacity-75" />
                        <span className="relative inline-flex size-3 rounded-full bg-white" />
                      </span>
                      <div>
                        <div className="font-semibold">Captura em andamento. Pode demorar alguns minutos.</div>
                        <div className="mt-1 text-sm text-primary-foreground/80">
                          Mantenha esta tela aberta. Nao e necessario atualizar a pagina.
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-md bg-white/[0.12] px-3 py-2 text-sm font-medium">
                      <Loader2 className="size-4 animate-spin" />
                      {capturedCount} comentarios
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <Badge variant={isFailed ? "destructive" : isCompleted ? "secondary" : "default"}>{job.status}</Badge>
                  <h2 className="mt-3 text-2xl font-semibold tracking-normal">{activeStep}</h2>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="size-4" />
                      Tempo decorrido: {elapsedTime}
                    </span>
                    <span>Ultima atualizacao: {formatDateTime(lastUpdatedAt)}</span>
                    <span>Inicio: {formatDateTime(job.startedAt)}</span>
                  </div>
                </div>
                <Button variant="outline" onClick={load}>
                  <RefreshCcw className="size-4" />
                  Atualizar
                </Button>
              </div>

              <Progress value={isCompleted ? 100 : undefined} indeterminate={!isCompleted && !isFailed} />

              {isActive ? (
                <div className="grid gap-3 rounded-md border bg-secondary/40 p-4 sm:grid-cols-3">
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">Etapa atual</div>
                    <div className="mt-1 text-sm font-medium">{activeStep}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">Comentarios localizados</div>
                    <div className="mt-1 text-sm font-medium">{capturedCount}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">Atualizacao automatica</div>
                    <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium">
                      <Activity className="size-4 text-primary" />
                      A cada 2,5s
                    </div>
                  </div>
                </div>
              ) : null}

              {isFailed ? (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Falha tecnica na captura</AlertTitle>
                  <AlertDescription>
                    {job.errorMessage ?? "Nao foi possivel capturar comentarios publicamente disponiveis desta postagem."}
                  </AlertDescription>
                </Alert>
              ) : null}

              {isCompleted ? (
                <Alert>
                  <CheckCircle2 className="size-4" />
                  <AlertTitle>Captura concluida</AlertTitle>
                  <AlertDescription>
                    Os comentarios capturados estao prontos para revisao e validacao automatica.
                  </AlertDescription>
                </Alert>
              ) : null}

              {isCancelled ? (
                <Alert>
                  <Ban className="size-4" />
                  <AlertTitle>Captura cancelada</AlertTitle>
                  <AlertDescription>
                    Esta captura foi cancelada. Voce pode iniciar uma nova captura automatica para este sorteio.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md border p-4">
              <Metric label="capturados" value={state?.stats.captured ?? 0} />
            </div>
            <div className="rounded-md border p-4">
              <Metric label="validos" value={state?.stats.valid ?? 0} />
            </div>
            <div className="rounded-md border p-4">
              <Metric label="excluidos" value={state?.stats.invalid ?? 0} />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={startCapture} disabled={isMutating || isActive}>
              {isMutating ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Iniciar captura automatica
            </Button>
            <Button variant="outline" onClick={cancelCapture} disabled={isMutating || !isActive}>
              <Ban className="size-4" />
              Cancelar captura
            </Button>
            <Button asChild variant="secondary" disabled={!isCompleted}>
              <Link href={`/sorteios/${giveawayId}/revisao`}>
                <CheckCircle2 className="size-4" />
                Revisar comentarios
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logs resumidos</CardTitle>
        </CardHeader>
        <CardContent>
          {job?.status === "queued" ? (
            <div className="mb-3 rounded-md border border-dashed bg-secondary/40 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Loader2 className="size-4 animate-spin text-primary" />
                Aguardando worker iniciar...
              </div>
              <div className="mt-1 text-muted-foreground">
                A captura ja esta na fila e sera iniciada assim que o worker assumir o job.
              </div>
            </div>
          ) : null}
          {logs.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              {job?.status === "queued" ? "Aguardando worker iniciar..." : "Os eventos tecnicos aparecerao aqui durante a captura."}
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log, index) => (
                <div
                  key={`${log.at}-${index}`}
                  className={`rounded-md border-l-2 p-3 ${
                    index === 0 ? "border-primary bg-primary/5" : "border-primary/35 bg-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{log.message}</div>
                    {index === 0 ? <Badge variant="secondary">mais recente</Badge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(log.at)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
