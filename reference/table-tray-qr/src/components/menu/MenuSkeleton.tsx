import { Skeleton } from "@/components/ui/skeleton";

export default function MenuSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background px-4">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-6 w-6 rounded" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-2 border-b border-border px-4 py-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 shrink-0 rounded-full" />
        ))}
      </div>

      {/* Cards skeleton */}
      <div className="grid grid-cols-2 gap-3 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
            <Skeleton className="aspect-video w-full" />
            <div className="flex flex-col gap-2 p-2.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
