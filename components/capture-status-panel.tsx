"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, Ban, CheckCircle2, Loader2, Play, RefreshCcw } from "lucide-react";
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

export function CaptureStatusPanel({ giveawayId }: { giveawayId: string }) {
  const { toast } = useToast();
  const [state, setState] = React.useState<CaptureState | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isMutating, setIsMutating] = React.useState(false);

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
  const logs = Array.isArray(job?.logs) ? job.logs.slice(-8).reverse() : [];
  const isActive = job?.status === "queued" || job?.status === "running";
  const isCompleted = job?.status === "completed";
  const isFailed = job?.status === "failed" || state?.giveaway?.status === "capture_failed";

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
            <div className="space-y-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <Badge variant={isFailed ? "destructive" : isCompleted ? "secondary" : "default"}>{job.status}</Badge>
                  <h2 className="mt-3 text-2xl font-semibold tracking-normal">{job.currentStep}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Inicio: {formatDateTime(job.startedAt)} | Fim: {formatDateTime(job.finishedAt)}
                  </p>
                </div>
                <Button variant="outline" onClick={load}>
                  <RefreshCcw className="size-4" />
                  Atualizar
                </Button>
              </div>

              <Progress value={isCompleted ? 100 : undefined} indeterminate={!isCompleted && !isFailed} />

              {isFailed ? (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Falha tecnica na captura</AlertTitle>
                  <AlertDescription>
                    {job.errorMessage ?? "Nao foi possivel capturar comentarios publicamente disponiveis desta postagem."}
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
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Os eventos tecnicos aparecerao aqui durante a captura.</p>
          ) : (
            <div className="space-y-3">
              {logs.map((log, index) => (
                <div key={`${log.at}-${index}`} className="border-l-2 border-primary/35 pl-3">
                  <div className="text-sm font-medium">{log.message}</div>
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
