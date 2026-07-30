import * as React from "react";
import { cn } from "@/lib/cn";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "info" | "warning" | "danger" | "success";
}

const tones = {
  info: "border-border bg-card text-card-foreground",
  warning: "border-warning bg-warning-soft text-foreground",
  danger: "border-destructive bg-destructive-soft text-foreground",
  success: "border-success bg-success-soft text-foreground",
};

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, tone = "info", ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      className={cn(
        "rounded-surface-lg border p-4 text-body",
        tones[tone],
        className,
      )}
      {...props}
    />
  ),
);
Alert.displayName = "Alert";

export { Alert };
