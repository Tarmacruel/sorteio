"use client";

import * as React from "react";
import { Loader2, RefreshCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Metric } from "@/components/metric";
import { DrawRevealDialog } from "@/components/draw-reveal-dialog";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";

type CommentRow = {
  id: string;
  username: string;
  text: string;
  commentedAt?: string | null;
  isValid: boolean;
  invalidReason?: string | null;
};

type CommentResponse = {
  comments: CommentRow[];
  stats: {
    total: number;
    valid: number;
    invalid: number;
    uniqueUsers: number;
    duplicates: number;
  };
};

function CommentTable({ comments, empty }: { comments: CommentRow[]; empty: string }) {
  if (comments.length === 0) {
    return <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">{empty}</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Usuario</TableHead>
          <TableHead>Comentario</TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Motivo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {comments.map((comment) => (
          <TableRow key={comment.id}>
            <TableCell className="font-medium">@{comment.username}</TableCell>
            <TableCell className="max-w-xl">
              <span className="line-clamp-2">{comment.text}</span>
            </TableCell>
            <TableCell>{formatDateTime(comment.commentedAt)}</TableCell>
            <TableCell>{comment.invalidReason ?? "Valido"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ReviewComments({ giveawayId }: { giveawayId: string }) {
  const { toast } = useToast();
  const [validData, setValidData] = React.useState<CommentResponse | null>(null);
  const [invalidData, setInvalidData] = React.useState<CommentResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isMutating, setIsMutating] = React.useState(false);

  const load = React.useCallback(async () => {
    const [validResponse, invalidResponse] = await Promise.all([
      fetch(`/api/giveaways/${giveawayId}/comments?valid=true&take=1000`, { cache: "no-store" }),
      fetch(`/api/giveaways/${giveawayId}/comments?valid=false&take=1000`, { cache: "no-store" }),
    ]);

    setValidData((await validResponse.json()) as CommentResponse);
    setInvalidData((await invalidResponse.json()) as CommentResponse);
    setIsLoading(false);
  }, [giveawayId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function validateAgain() {
    setIsMutating(true);
    const response = await fetch(`/api/giveaways/${giveawayId}/validate`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setIsMutating(false);

    if (!response.ok) {
      toast({ title: "Validacao nao concluida", description: data.error });
      return;
    }

    toast({ title: "Comentarios validados", description: `${data.valid} validos e ${data.invalid} invalidos.` });
    await load();
  }

  const stats = validData?.stats ?? invalidData?.stats ?? {
    total: 0,
    valid: 0,
    invalid: 0,
    uniqueUsers: 0,
    duplicates: 0,
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded-md border bg-card p-4">
          <Metric label="capturados" value={stats.total} />
        </div>
        <div className="rounded-md border bg-card p-4">
          <Metric label="validos" value={stats.valid} />
        </div>
        <div className="rounded-md border bg-card p-4">
          <Metric label="invalidos" value={stats.invalid} />
        </div>
        <div className="rounded-md border bg-card p-4">
          <Metric label="usuarios unicos" value={stats.uniqueUsers} />
        </div>
        <div className="rounded-md border bg-card p-4">
          <Metric label="duplicados" value={stats.duplicates} />
        </div>
      </div>

      <Alert>
        <ShieldCheck className="size-4" />
        <AlertTitle>Regras aplicadas automaticamente</AlertTitle>
        <AlertDescription>
          Comentarios invalidos mantem o motivo de exclusao para auditoria. A tela mostra ate 1000 itens por aba; as
          exportacoes incluem a base completa.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" onClick={validateAgain} disabled={isMutating}>
          {isMutating ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
          Validar novamente
        </Button>
        <DrawRevealDialog
          giveawayId={giveawayId}
          participants={validData?.comments ?? []}
          validCount={stats.valid}
          disabled={isMutating || stats.valid === 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comentarios capturados</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <Tabs defaultValue="valid">
              <TabsList>
                <TabsTrigger value="valid">Validos</TabsTrigger>
                <TabsTrigger value="invalid">Invalidos</TabsTrigger>
              </TabsList>
              <TabsContent value="valid">
                <CommentTable comments={validData?.comments ?? []} empty="Nenhum comentario valido encontrado." />
              </TabsContent>
              <TabsContent value="invalid">
                <CommentTable comments={invalidData?.comments ?? []} empty="Nenhum comentario invalido encontrado." />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
