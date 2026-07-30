import { Button } from "@/components/ui/button";
import type { Period } from "@/lib/report-utils";

const labels: Record<Period, string> = { day: "Día", week: "Semana", month: "Mes", year: "Año" };

interface Props { value: Period; onChange: (p: Period) => void; }

export default function PeriodSelector({ value, onChange }: Props) {
  return (
    <div className="flex gap-1 bg-muted rounded-lg p-1">
      {(["day", "week", "month", "year"] as Period[]).map(p => (
        <Button
          key={p}
          size="sm"
          variant={value === p ? "default" : "ghost"}
          className="text-xs h-7 px-3"
          onClick={() => onChange(p)}
        >
          {labels[p]}
        </Button>
      ))}
    </div>
  );
}
