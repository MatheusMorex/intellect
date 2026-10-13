"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

// Abas (components.md): "segmented" para 2 a 4 opções curtas; "underline" para
// trocar de seção na página (ex.: Contas > Campanhas > Conjuntos > Anúncios).

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-2", className)} {...props} />;
}

function TabsList({
  className,
  variant = "segmented",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: "segmented" | "underline" }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        "group/tabs text-muted-foreground",
        variant === "segmented" && "inline-flex h-9 w-fit items-center justify-center rounded-md bg-muted p-[3px]",
        variant === "underline" && "flex w-full items-end gap-1 border-b",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 data-[state=active]:font-semibold data-[state=active]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=segmented]/tabs:h-full group-data-[variant=segmented]/tabs:flex-1 group-data-[variant=segmented]/tabs:rounded-sm group-data-[variant=segmented]/tabs:px-2 group-data-[variant=segmented]/tabs:py-1 group-data-[variant=segmented]/tabs:data-[state=active]:bg-card group-data-[variant=segmented]/tabs:data-[state=active]:shadow-card",
        "group-data-[variant=underline]/tabs:-mb-px group-data-[variant=underline]/tabs:border-b-2 group-data-[variant=underline]/tabs:border-transparent group-data-[variant=underline]/tabs:px-3 group-data-[variant=underline]/tabs:pb-2 group-data-[variant=underline]/tabs:data-[state=active]:border-primary",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 outline-none", className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
