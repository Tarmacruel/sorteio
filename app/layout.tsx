import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Toaster } from "@/components/ui/toast";
import { appName } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: `${appName} | Sorteios auditaveis no Instagram`,
  description: "Plataforma SaaS para captura automatica, validacao e auditoria de sorteios de comentarios do Instagram.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="sticky top-0 z-40 border-b bg-background/92 backdrop-blur">
          <div className="container flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </span>
              <span className="whitespace-nowrap">{appName}</span>
            </Link>
            <nav className="flex items-center gap-2 text-sm">
              <Link href="/dashboard" className="hidden rounded-md px-3 py-2 text-muted-foreground transition hover:text-foreground sm:inline-flex">
                Dashboard
              </Link>
              <Link href="/sorteios/novo" className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground transition hover:bg-primary/90">
                <span className="sm:hidden">Criar</span>
                <span className="hidden sm:inline">Criar sorteio</span>
              </Link>
            </nav>
          </div>
        </header>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
