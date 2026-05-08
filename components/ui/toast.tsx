"use client";

import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastItem = {
  id: string;
  title: string;
  description?: string;
};

export function useToast() {
  return {
    toast: (item: Omit<ToastItem, "id">) => {
      window.dispatchEvent(new CustomEvent("app-toast", { detail: item }));
    },
  };
}

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((item: Omit<ToastItem, "id">) => {
    const id = crypto.randomUUID();
    setItems((current) => [...current, { id, ...item }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((toastItem) => toastItem.id !== id));
    }, 4200);
  }, []);

  React.useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<Omit<ToastItem, "id">>).detail;
      toast(detail);
    };
    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, [toast]);

  return (
    <ToastPrimitives.Provider swipeDirection="right">
      {items.map((item) => (
        <ToastPrimitives.Root
          key={item.id}
          className={cn(
            "grid w-full max-w-sm gap-1 rounded-lg border bg-background p-4 text-foreground shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
          )}
        >
          <div className="text-sm font-semibold">{item.title}</div>
          {item.description ? <div className="text-sm text-muted-foreground">{item.description}</div> : null}
          <ToastPrimitives.Close className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </ToastPrimitives.Close>
        </ToastPrimitives.Root>
      ))}
      <ToastPrimitives.Viewport className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 sm:max-w-sm" />
    </ToastPrimitives.Provider>
  );
}
