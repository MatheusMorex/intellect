import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto grid max-w-content grid-cols-1 gap-4 p-4 sm:p-6" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-72" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
