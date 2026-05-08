import { GiveawayWizard } from "@/components/giveaway-wizard";

export default function NewGiveawayPage() {
  return (
    <main className="container py-8">
      <div className="mb-8 max-w-3xl border-b pb-6">
        <p className="text-sm font-semibold uppercase text-primary">Novo Sorteio</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">Configure um sorteio automatizado</h1>
        <p className="mt-2 text-muted-foreground">
          Informe a postagem, defina regras e inicie a captura automatica de comentarios publicos.
        </p>
      </div>
      <GiveawayWizard />
    </main>
  );
}
