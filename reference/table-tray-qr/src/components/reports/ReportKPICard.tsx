import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  trend?: number; // percentage
}

export default function ReportKPICard({ label, value, icon: Icon, subtitle, trend }: Props) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {trend !== undefined && (
          <p className={cn("text-xs font-medium mt-1", trend >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
            {trend >= 0 ? "+" : ""}{trend}% vs período anterior
          </p>
        )}
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
