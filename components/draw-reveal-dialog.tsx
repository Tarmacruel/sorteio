"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Dices, Loader2, ShieldCheck, Sparkles, Trophy, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type DrawRevealParticipant = {
  id: string;
  username: string;
  text?: string | null;
  profileImageUrl?: string | null;
};

type DrawApiResponse = {
  seed: string;
  participantsHash: string;
  winners: DrawRevealParticipant[];
  alternates: DrawRevealParticipant[];
};

type RevealItem = DrawRevealParticipant & {
  revealType: "winner" | "alternate";
  revealPosition: number;
};

type RevealStage = "confirming" | "drawing" | "countdown" | "rolling" | "revealed" | "finished";

type DrawRevealDialogProps = {
  giveawayId: string;
  participants: DrawRevealParticipant[];
  validCount: number;
  disabled?: boolean;
};

function formatHandle(username: string) {
  const clean = username.trim().replace(/^@/, "");
  return `@${clean}`;
}

function ParticipantAvatar({ participant, className }: { participant: DrawRevealParticipant; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  const src = participant.profileImageUrl && !failed ? participant.profileImageUrl : null;
  const fallback = participant.username.trim().replace(/^@/, "").slice(0, 1).toUpperCase();

  return (
    <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-muted-foreground", className)}>
      {src ? (
        <img
          src={src}
          alt={`Foto de perfil de ${formatHandle(participant.username)}`}
          className="size-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : fallback ? (
        <span className="font-semibold">{fallback}</span>
      ) : (
        <UserRound className="size-1/2" />
      )}
    </div>
  );
}

function revealLabel(item: RevealItem) {
  return item.revealType === "winner" ? `Vencedor ${item.revealPosition}` : `Suplente ${item.revealPosition}`;
}

function buildRevealItems(result: DrawApiResponse): RevealItem[] {
  return [
    ...result.winners.map((winner, index) => ({
      ...winner,
      revealType: "winner" as const,
      revealPosition: index + 1,
    })),
    ...result.alternates.map((alternate, index) => ({
      ...alternate,
      revealType: "alternate" as const,
      revealPosition: index + 1,
    })),
  ];
}

function buildTickerPool(participants: DrawRevealParticipant[], revealItems: RevealItem[]) {
  const handles = [...participants, ...revealItems].map((participant) => formatHandle(participant.username));
  const uniqueHandles = Array.from(new Set(handles.filter(Boolean)));
  return uniqueHandles.length > 0 ? uniqueHandles : ["@participante"];
}

function makeTickerRow(pool: string[], center: string, offset: number) {
  const safePool = pool.length > 0 ? pool : [center];
  const base = safePool.length * 100 + offset;
  const row = Array.from({ length: 7 }, (_, index) => safePool[(base + index) % safePool.length]);
  row[3] = center;
  return row;
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);

    const onChange = () => setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return reducedMotion;
}

export function DrawRevealDialog({ giveawayId, participants, validCount, disabled }: DrawRevealDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const [stage, setStage] = React.useState<RevealStage>("confirming");
  const [countdown, setCountdown] = React.useState(3);
  const [drawResult, setDrawResult] = React.useState<DrawApiResponse | null>(null);
  const [revealItems, setRevealItems] = React.useState<RevealItem[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [tickerNames, setTickerNames] = React.useState<string[]>(makeTickerRow(["@participante"], "@participante", 0));

  const currentItem = revealItems[currentIndex] ?? null;
  const tickerPool = React.useMemo(() => buildTickerPool(participants, revealItems), [participants, revealItems]);
  const isLocked = stage === "drawing" || stage === "countdown" || stage === "rolling";

  const startReveal = React.useCallback(
    (index: number, sequence = revealItems) => {
      const item = sequence[index];

      if (!item) {
        setStage("finished");
        return;
      }

      const pool = buildTickerPool(participants, sequence);
      const target = formatHandle(item.username);
      setCurrentIndex(index);
      setTickerNames(makeTickerRow(pool, target, index));

      if (reducedMotion) {
        setStage("revealed");
        return;
      }

      setCountdown(3);
      setStage("countdown");
    },
    [participants, reducedMotion, revealItems],
  );

  async function runDraw() {
    setStage("drawing");

    const response = await fetch(`/api/giveaways/${giveawayId}/draw`, { method: "POST" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const description = typeof data.error === "string" ? data.error : "Não foi possível realizar o sorteio.";
      toast({ title: "Sorteio não realizado", description });
      setStage("confirming");
      return;
    }

    const result = data as DrawApiResponse;
    const sequence = buildRevealItems(result);
    setDrawResult(result);
    setRevealItems(sequence);

    if (sequence.length === 0) {
      setStage("finished");
      return;
    }

    startReveal(0, sequence);
  }

  React.useEffect(() => {
    if (stage !== "countdown") return;

    const timeout = window.setTimeout(() => {
      if (countdown <= 1) {
        setStage("rolling");
        return;
      }

      setCountdown((value) => value - 1);
    }, 760);

    return () => window.clearTimeout(timeout);
  }, [countdown, stage]);

  React.useEffect(() => {
    if (stage !== "rolling" || !currentItem) return;

    const target = formatHandle(currentItem.username);
    const maxTicks = 30;
    let tick = 0;
    let timeout: number | undefined;

    const runTick = () => {
      if (tick >= maxTicks) {
        setTickerNames(makeTickerRow(tickerPool, target, maxTicks));
        setStage("revealed");
        return;
      }

      const center = tickerPool[(tick * 5 + currentIndex) % tickerPool.length] ?? target;
      setTickerNames(makeTickerRow(tickerPool, center, tick));

      const progress = tick / maxTicks;
      const delay = 42 + Math.round(progress * progress * 190);
      tick += 1;
      timeout = window.setTimeout(runTick, delay);
    };

    runTick();
    return () => {
      if (timeout) window.clearTimeout(timeout);
    };
  }, [currentIndex, currentItem, stage, tickerPool]);

  function onOpenChange(nextOpen: boolean) {
    if (!nextOpen && isLocked) return;
    setOpen(nextOpen);

    if (nextOpen && !drawResult) {
      setStage("confirming");
    }
  }

  function goToResult() {
    router.push(`/resultado/${giveawayId}`);
  }

  const nextItemExists = currentIndex < revealItems.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          {drawResult ? <Trophy className="size-4" /> : <Dices className="size-4" />}
          {drawResult ? "Ver revelação" : "Realizar sorteio"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl overflow-hidden p-0 [&>button]:text-white [&>button]:ring-offset-slate-950 [&>button:hover]:text-white">
        <div className="bg-slate-950 px-6 py-5 text-white">
          <DialogHeader>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-200">
              <ShieldCheck className="size-4" />
              Resultado auditável
            </div>
            <DialogTitle className="text-2xl text-white">Revelação do sorteio</DialogTitle>
            <DialogDescription className="text-slate-300">
              O sorteio é gravado no servidor antes da animação. Seed e hash permanecem na página pública.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6">
          {stage === "confirming" ? (
            <div className="space-y-5">
              <div className="rounded-md border bg-muted/40 p-4">
                <div className="text-sm font-medium">Tudo pronto para sortear</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {validCount} participantes válidos serão considerados conforme as regras já aplicadas.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={runDraw} disabled={disabled}>
                  <Dices className="size-4" />
                  Confirmar sorteio
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {stage === "drawing" ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <Loader2 className="size-10 animate-spin text-primary" />
              <h3 className="mt-5 text-xl font-semibold">Realizando sorteio...</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                O resultado está sendo registrado com seed criptográfica antes da revelação.
              </p>
            </div>
          ) : null}

          {stage === "countdown" ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <div className="text-sm font-semibold uppercase text-primary">{currentItem ? revealLabel(currentItem) : "Sorteio"}</div>
              <div className="mt-4 flex size-32 items-center justify-center rounded-full border bg-white text-7xl font-semibold shadow-soft animate-draw-glow motion-reduce:animate-none">
                {countdown}
              </div>
              <p className="mt-5 text-sm text-muted-foreground">Preparando roleta de participantes...</p>
            </div>
          ) : null}

          {stage === "rolling" ? (
            <div className="flex min-h-72 flex-col justify-center">
              <div className="mb-5 text-center">
                <div className="text-sm font-semibold uppercase text-primary">{currentItem ? revealLabel(currentItem) : "Sorteio"}</div>
                <h3 className="mt-2 text-xl font-semibold">Girando participantes</h3>
              </div>
              <div className="relative overflow-hidden rounded-md border bg-white p-4">
                <div className="pointer-events-none absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-primary/60" />
                <div className="flex items-center justify-center gap-2 animate-draw-ticker motion-reduce:animate-none">
                  {tickerNames.map((name, index) => (
                    <div
                      key={`${name}-${index}`}
                      className={cn(
                        "min-w-24 rounded-md border px-3 py-2 text-center text-sm font-medium text-muted-foreground transition-all",
                        index === 3 && "min-w-36 border-primary bg-primary text-primary-foreground shadow-soft",
                      )}
                    >
                      {name}
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-4 text-center text-sm text-muted-foreground">A roleta vai desacelerar no resultado registrado.</p>
            </div>
          ) : null}

          {stage === "revealed" && currentItem ? (
            <div className="space-y-5">
              <div className="rounded-md border bg-white p-5 text-center shadow-soft animate-draw-pop motion-reduce:animate-none">
                <div className="relative mx-auto w-fit">
                  <ParticipantAvatar participant={currentItem} className="size-24 text-3xl shadow-soft" />
                  <div className="absolute -bottom-1 -right-1 flex size-9 items-center justify-center rounded-full border-4 border-white bg-primary text-primary-foreground">
                    {currentItem.revealType === "winner" ? <Trophy className="size-4" /> : <Sparkles className="size-4" />}
                  </div>
                </div>
                <div className="mt-4 text-sm font-semibold uppercase text-primary">{revealLabel(currentItem)}</div>
                <div className="mt-2 break-all text-4xl font-semibold">{formatHandle(currentItem.username)}</div>
                {currentItem.text ? <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground line-clamp-2">{currentItem.text}</p> : null}
              </div>

              {drawResult ? (
                <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="font-medium text-foreground">Seed registrada</div>
                    <div className="mt-1 break-all font-mono">{drawResult.seed.slice(0, 24)}...</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="font-medium text-foreground">Hash dos participantes</div>
                    <div className="mt-1 break-all font-mono">{drawResult.participantsHash.slice(0, 24)}...</div>
                  </div>
                </div>
              ) : null}

              <DialogFooter>
                {nextItemExists ? (
                  <Button onClick={() => startReveal(currentIndex + 1)}>
                    <Sparkles className="size-4" />
                    Revelar próximo
                  </Button>
                ) : (
                  <Button onClick={() => setStage("finished")}>
                    <CheckCircle2 className="size-4" />
                    Concluir revelação
                  </Button>
                )}
              </DialogFooter>
            </div>
          ) : null}

          {stage === "finished" ? (
            <div className="space-y-5">
              <div className="rounded-md border bg-muted/30 p-4">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="size-5 text-primary" />
                  Sorteio revelado
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  O resultado público já está disponível com seed, hash e trilha de auditoria.
                </p>
              </div>

              <div className="max-h-72 space-y-2 overflow-auto pr-1">
                {revealItems.map((item) => (
                  <div key={`${item.revealType}-${item.id}-${item.revealPosition}`} className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <ParticipantAvatar participant={item} className="size-10 text-sm" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase text-primary">{revealLabel(item)}</div>
                        <div className="truncate font-medium">{formatHandle(item.username)}</div>
                      </div>
                    </div>
                    {item.revealType === "winner" ? <Trophy className="size-4 text-primary" /> : <Sparkles className="size-4 text-muted-foreground" />}
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button onClick={goToResult}>
                  Ver resultado público
                  <ArrowRight className="size-4" />
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
