import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeUsername(username: string) {
  return username.trim().replace(/^@/, "").toLowerCase();
}

export function normalizeList(value?: string | string[]) {
  if (!value) return [];
  const source = Array.isArray(value) ? value.join(",") : value;
  return source
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatDateTime(date?: Date | string | null) {
  if (!date) return "Nao informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };

  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}
