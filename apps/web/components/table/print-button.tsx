"use client";

import { Button } from "@/components/ui/button";
import { PrintIcon } from "@/components/ui/icons";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <Button
      className="print:hidden"
      onClick={() => window.print()}
      type="button"
    >
      <PrintIcon aria-hidden="true" />
      {label}
    </Button>
  );
}
