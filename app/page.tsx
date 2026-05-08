import Link from "next/link";
import { ArrowRight, CheckCircle2, FileCheck2, Gauge, LockKeyhole, Play, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  {
    title: "Informe a publicacao",
    description: "Cole a URL publica do post, Reel ou IGTV e defina vencedores, suplentes e prazo dos comentarios.",
  },
  {
    title: "Aplique as regras",
    description: "Configure palavra obrigatoria, hashtag, marcacoes, bloqueios, duplicidades e usuarios permitidos.",
  },
  {
    title: "Publique o resultado",
    description: "Capture, valide, sorteie e compartilhe uma pagina publica com seed, hash e trilha de auditoria.",
  },
];

const features = [
  "Captura automatica com Playwright",
  "Validacao por regras configuraveis",
  "Sorteio deterministico com seed criptografica",
  "Resultado publico exportavel",
];

export default function LandingPage() {
  return (
    <main>
      <section className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden border-b bg-[#0f172a] text-white">
        <div className="absolute inset-0 grid-paper opacity-35" />
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.32),transparent_45%)] lg:block" />
        <div className="container relative grid min-h-[calc(100svh-4rem)] items-center gap-10 py-16 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="max-w-2xl animate-fade-up">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-white/[0.15] bg-white/[0.08] px-3 py-1 text-sm text-white/[0.82]">
              <ShieldCheck className="size-4" />
              Sorteios de comentarios com captura automatica e auditoria
            </div>
            <h1 className="text-balance text-5xl font-semibold leading-[0.98] tracking-normal sm:text-6xl lg:text-7xl">
              Sorteio Auditavel
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/76">
              Uma plataforma SaaS para coletar comentarios publicos do Instagram, validar regras do sorteio e publicar resultados verificaveis.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="bg-white text-slate-950 hover:bg-white/90">
                <Link href="/sorteios/novo">
                  Criar sorteio
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <Link href="/dashboard">Ver dashboard</Link>
              </Button>
            </div>
          </div>

          <div className="relative min-h-[420px] animate-fade-up [animation-delay:160ms]">
            <div className="absolute inset-x-2 top-0 h-full rounded-[2rem] border border-white/10 bg-white/[0.08] shadow-soft backdrop-blur-md" />
            <div className="absolute inset-6 overflow-hidden rounded-2xl border border-white/[0.12] bg-slate-950/70">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-sm text-white/58">Captura em andamento</p>
                  <p className="font-medium">instagram.com/p/Codex123</p>
                </div>
                <span className="rounded-md bg-teal-400 px-2.5 py-1 text-xs font-semibold text-slate-950">Playwright</span>
              </div>
              <div className="relative h-24 border-b border-white/10 bg-white/[0.03]">
                <div className="absolute inset-x-0 top-0 h-20 animate-scan-line bg-gradient-to-b from-transparent via-teal-300/22 to-transparent" />
                <div className="grid h-full grid-cols-4 divide-x divide-white/10">
                  {["URL", "Comentarios", "Regras", "Auditoria"].map((item) => (
                    <div key={item} className="flex items-center justify-center text-sm text-white/68">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3 p-5">
                {[
                  ["Acessando publicacao...", "ok"],
                  ["Carregando comentarios...", "ok"],
                  ["Removendo duplicidades...", "live"],
                  ["Gerando hash dos participantes...", "wait"],
                ].map(([label, status]) => (
                  <div key={label} className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.04] px-4 py-3">
                    <span className="text-sm text-white/78">{label}</span>
                    <span className={status === "live" ? "text-amber-300" : status === "ok" ? "text-teal-300" : "text-white/42"}>
                      {status === "ok" ? <CheckCircle2 className="size-4" /> : status === "live" ? <Sparkles className="size-4" /> : <Gauge className="size-4" />}
                    </span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 border-t border-white/10">
                {[
                  ["1.842", "capturados"],
                  ["1.109", "validos"],
                  ["733", "excluidos"],
                ].map(([value, label]) => (
                  <div key={label} className="px-5 py-4">
                    <div className="text-2xl font-semibold">{value}</div>
                    <div className="text-xs uppercase text-white/48">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase text-primary">Fluxo em 3 passos</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal">Da URL ao resultado publico sem planilhas.</h2>
        </div>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="border-t pt-6">
              <div className="mb-5 flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                {index + 1}
              </div>
              <h3 className="text-xl font-semibold">{step.title}</h3>
              <p className="mt-3 leading-7 text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-white">
        <div className="container grid gap-12 py-20 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-semibold uppercase text-primary">Recursos principais</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal">Regras claras, sorteio reprodutivel e rastreio tecnico.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((feature) => (
              <div key={feature} className="flex gap-3 border-t pt-4">
                <CheckCircle2 className="mt-1 size-5 text-primary" />
                <span className="font-medium">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container grid gap-12 py-20 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <FileCheck2 className="mb-5 size-10 text-primary" />
          <h2 className="text-3xl font-semibold tracking-normal">Regras personalizadas.</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Combine palavra obrigatoria, hashtag, marcacoes, prazo, usuarios bloqueados ou lista permitida.
          </p>
        </div>
        <div className="lg:col-span-1">
          <LockKeyhole className="mb-5 size-10 text-primary" />
          <h2 className="text-3xl font-semibold tracking-normal">Transparencia publica.</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Cada resultado mostra seed, hash da lista de participantes, totais, regras aplicadas e logs de auditoria.
          </p>
        </div>
        <div className="lg:col-span-1">
          <Play className="mb-5 size-10 text-primary" />
          <h2 className="text-3xl font-semibold tracking-normal">Captura automatica.</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            O worker usa Playwright para carregar comentarios publicos e registra falhas quando a postagem exige login ou esta indisponivel.
          </p>
        </div>
      </section>

      <section className="border-t bg-[#10231f] text-white">
        <div className="container flex flex-col items-start justify-between gap-8 py-16 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal">Pronto para criar seu sorteio?</h2>
            <p className="mt-3 max-w-2xl text-white/70">
              Configure as regras, inicie a captura automatica e entregue um resultado publico auditavel.
            </p>
          </div>
          <Button asChild size="lg" className="bg-white text-slate-950 hover:bg-white/90">
            <Link href="/sorteios/novo">
              Criar sorteio
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
