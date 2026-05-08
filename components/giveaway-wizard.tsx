"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Play, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { ruleLabels } from "@/lib/constants";
import { normalizeList } from "@/lib/utils";
import type { RuleType } from "@/types/giveaway";

type RuleForm = {
  type: RuleType;
  enabled: boolean;
  config: {
    phrase?: string;
    hashtag?: string;
    min?: number;
    words?: string;
    usernames?: string;
    minLength?: number;
  };
};

const defaultRules: RuleForm[] = [
  { type: "required_phrase", enabled: false, config: { phrase: "" } },
  { type: "required_hashtag", enabled: false, config: { hashtag: "" } },
  { type: "min_mentions", enabled: false, config: { min: 2 } },
  { type: "require_mention", enabled: false, config: {} },
  { type: "forbidden_words", enabled: false, config: { words: "" } },
  { type: "blocked_users", enabled: false, config: { usernames: "" } },
  { type: "allowed_users", enabled: false, config: { usernames: "" } },
  { type: "exclude_organizer", enabled: true, config: {} },
  { type: "ignore_duplicates", enabled: true, config: {} },
  { type: "min_length", enabled: true, config: { minLength: 3 } },
];

const steps = ["Dados basicos", "Regras", "Captura automatica", "Revisao"];

function serializeRule(rule: RuleForm) {
  if (rule.type === "forbidden_words") {
    return { ...rule, config: { words: normalizeList(rule.config.words) } };
  }

  if (rule.type === "blocked_users" || rule.type === "allowed_users") {
    return { ...rule, config: { usernames: normalizeList(rule.config.usernames) } };
  }

  return rule;
}

export function GiveawayWizard() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = React.useState(0);
  const [giveawayId, setGiveawayId] = React.useState<string | null>(null);
  const [postUrl, setPostUrl] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [organizerUsername, setOrganizerUsername] = React.useState("");
  const [oneChancePerUser, setOneChancePerUser] = React.useState(true);
  const [allowMultipleEntries, setAllowMultipleEntries] = React.useState(false);
  const [rules, setRules] = React.useState<RuleForm[]>(defaultRules);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function updateRule(type: RuleType, patch: Partial<RuleForm>) {
    setRules((current) => current.map((rule) => (rule.type === type ? { ...rule, ...patch } : rule)));
  }

  function updateRuleConfig(type: RuleType, config: RuleForm["config"]) {
    setRules((current) =>
      current.map((rule) => (rule.type === type ? { ...rule, config: { ...rule.config, ...config } } : rule)),
    );
  }

  async function createGiveaway(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);

    const response = await fetch("/api/giveaways", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        instagramPostUrl: postUrl,
        organizerUsername,
        description: form.get("description")?.toString() || null,
        winnersCount: Number(form.get("winnersCount") || 1),
        alternatesCount: Number(form.get("alternatesCount") || 0),
        oneChancePerUser,
        allowMultipleEntries,
        commentDeadline: form.get("commentDeadline")?.toString() || null,
      }),
    });

    const data = await response.json();
    setIsSubmitting(false);

    if (!response.ok) {
      toast({ title: "Nao foi possivel criar", description: data.error });
      return;
    }

    setGiveawayId(data.giveaway.id);
    setStep(1);
    toast({ title: "Sorteio criado", description: "Agora configure as regras de participacao." });
  }

  async function saveRules() {
    if (!giveawayId) return;
    setIsSubmitting(true);

    const response = await fetch(`/api/giveaways/${giveawayId}/rules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rules: rules.map(serializeRule),
      }),
    });

    const data = await response.json().catch(() => ({}));
    setIsSubmitting(false);

    if (!response.ok) {
      toast({ title: "Erro ao salvar regras", description: data.error });
      return;
    }

    setStep(2);
    toast({ title: "Regras salvas", description: "A captura automatica ja pode ser iniciada." });
  }

  async function startCapture() {
    if (!giveawayId) return;
    setIsSubmitting(true);

    const response = await fetch(`/api/giveaways/${giveawayId}/capture`, {
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    setIsSubmitting(false);

    if (!response.ok) {
      toast({ title: "Captura nao iniciada", description: data.error });
      return;
    }

    router.push(`/sorteios/${giveawayId}/captura`);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-2">
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm transition ${
                index === step ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
              }`}
              onClick={() => {
                if (index <= step || giveawayId) setStep(index);
              }}
            >
              <span className="flex size-7 items-center justify-center rounded-md border border-current/30">
                {index < step ? <Check className="size-4" /> : index + 1}
              </span>
              {label}
            </button>
          ))}
        </div>
      </aside>

      <Card>
        <CardContent className="p-6 md:p-8">
          {step === 0 ? (
            <form onSubmit={createGiveaway} className="space-y-8">
              <div>
                <p className="text-sm font-semibold uppercase text-primary">Etapa 1</p>
                <h2 className="mt-2 text-2xl font-semibold">Dados basicos</h2>
                <p className="mt-2 text-muted-foreground">
                  A captura sera feita automaticamente a partir da URL da postagem informada.
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="title">Titulo do sorteio</Label>
                  <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="instagramPostUrl">URL da postagem do Instagram</Label>
                  <Input
                    id="instagramPostUrl"
                    type="url"
                    value={postUrl}
                    onChange={(event) => setPostUrl(event.target.value)}
                    placeholder="https://www.instagram.com/p/..."
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organizerUsername">Perfil organizador</Label>
                  <Input
                    id="organizerUsername"
                    value={organizerUsername}
                    onChange={(event) => setOrganizerUsername(event.target.value)}
                    placeholder="@sua_marca"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="winnersCount">Vencedores</Label>
                    <Input id="winnersCount" name="winnersCount" type="number" min={1} defaultValue={1} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="alternatesCount">Suplentes</Label>
                    <Input id="alternatesCount" name="alternatesCount" type="number" min={0} defaultValue={0} />
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description">Descricao</Label>
                  <Textarea id="description" name="description" placeholder="Contexto do sorteio, premio ou observacoes internas." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commentDeadline">Data/hora limite dos comentarios</Label>
                  <Input id="commentDeadline" name="commentDeadline" type="datetime-local" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-md border p-4">
                  <div>
                    <Label>Considerar uma chance por usuario</Label>
                    <p className="mt-1 text-sm text-muted-foreground">Impede repeticao de username no sorteio.</p>
                  </div>
                  <Switch checked={oneChancePerUser} onCheckedChange={setOneChancePerUser} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-4">
                  <div>
                    <Label>Permitir multiplas chances por comentario</Label>
                    <p className="mt-1 text-sm text-muted-foreground">Mantem comentarios validos como entradas independentes.</p>
                  </div>
                  <Switch checked={allowMultipleEntries} onCheckedChange={setAllowMultipleEntries} />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                  Continuar
                </Button>
              </div>
            </form>
          ) : null}

          {step === 1 ? (
            <div className="space-y-8">
              <div>
                <p className="text-sm font-semibold uppercase text-primary">Etapa 2</p>
                <h2 className="mt-2 text-2xl font-semibold">Regras</h2>
                <p className="mt-2 text-muted-foreground">
                  Ative apenas as regras necessarias. Cada regra sera registrada na auditoria do resultado.
                </p>
              </div>

              <div className="grid gap-4">
                {rules.map((rule) => (
                  <div key={rule.type} className="rounded-md border p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <Label>{ruleLabels[rule.type]}</Label>
                        <p className="mt-1 text-sm text-muted-foreground">{rule.type}</p>
                      </div>
                      <Switch checked={rule.enabled} onCheckedChange={(enabled) => updateRule(rule.type, { enabled })} />
                    </div>
                    {rule.type === "required_phrase" ? (
                      <Input
                        className="mt-4"
                        placeholder="Ex: quero participar"
                        value={rule.config.phrase ?? ""}
                        onChange={(event) => updateRuleConfig(rule.type, { phrase: event.target.value })}
                      />
                    ) : null}
                    {rule.type === "required_hashtag" ? (
                      <Input
                        className="mt-4"
                        placeholder="#minhahashtag"
                        value={rule.config.hashtag ?? ""}
                        onChange={(event) => updateRuleConfig(rule.type, { hashtag: event.target.value })}
                      />
                    ) : null}
                    {rule.type === "min_mentions" ? (
                      <Input
                        className="mt-4 max-w-xs"
                        type="number"
                        min={1}
                        value={rule.config.min ?? 1}
                        onChange={(event) => updateRuleConfig(rule.type, { min: Number(event.target.value) })}
                      />
                    ) : null}
                    {rule.type === "forbidden_words" ? (
                      <Input
                        className="mt-4"
                        placeholder="palavra1, palavra2"
                        value={rule.config.words ?? ""}
                        onChange={(event) => updateRuleConfig(rule.type, { words: event.target.value })}
                      />
                    ) : null}
                    {(rule.type === "blocked_users" || rule.type === "allowed_users") ? (
                      <Input
                        className="mt-4"
                        placeholder="@usuario1, @usuario2"
                        value={rule.config.usernames ?? ""}
                        onChange={(event) => updateRuleConfig(rule.type, { usernames: event.target.value })}
                      />
                    ) : null}
                    {rule.type === "min_length" ? (
                      <Input
                        className="mt-4 max-w-xs"
                        type="number"
                        min={1}
                        value={rule.config.minLength ?? 3}
                        onChange={(event) => updateRuleConfig(rule.type, { minLength: Number(event.target.value) })}
                      />
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button onClick={saveRules} disabled={isSubmitting || !giveawayId}>
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                  Salvar regras
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-8">
              <div>
                <p className="text-sm font-semibold uppercase text-primary">Etapa 3</p>
                <h2 className="mt-2 text-2xl font-semibold">Captura automatica</h2>
                <p className="mt-2 text-muted-foreground">
                  O worker Playwright acessara somente comentarios publicamente disponiveis.
                </p>
              </div>

              <Alert>
                <ShieldCheck className="size-4" />
                <AlertTitle>Resumo da postagem</AlertTitle>
                <AlertDescription>
                  <div className="mt-2 grid gap-2 text-sm">
                    <span>
                      <strong>Titulo:</strong> {title}
                    </span>
                    <span>
                      <strong>URL:</strong> {postUrl}
                    </span>
                    <span>
                      <strong>Organizador:</strong> {organizerUsername}
                    </span>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="rounded-md border p-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div>
                    <h3 className="font-semibold">Iniciar captura automatica</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Se a postagem exigir login, estiver indisponivel ou limitada, a falha tecnica sera registrada.
                    </p>
                  </div>
                  <Button onClick={startCapture} disabled={isSubmitting || !giveawayId}>
                    {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    Iniciar captura
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold uppercase text-primary">Etapa 4</p>
                <h2 className="mt-2 text-2xl font-semibold">Revisao</h2>
                <p className="mt-2 text-muted-foreground">
                  Depois que a captura terminar, revise validos e invalidos antes de realizar o sorteio.
                </p>
              </div>
              <Button asChild disabled={!giveawayId}>
                <a href={giveawayId ? `/sorteios/${giveawayId}/revisao` : "#"}>
                  Abrir revisao
                  <ArrowRight className="size-4" />
                </a>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
