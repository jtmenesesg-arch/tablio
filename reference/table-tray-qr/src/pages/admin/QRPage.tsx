import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/contexts/AdminContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QRCodeCanvas } from "qrcode.react";
import { Download, Printer, QrCode, UtensilsCrossed, CreditCard } from "lucide-react";

interface TableRow2 {
  id: string;
  number: number;
  name: string | null;
  status: string | null;
  qr_token: string | null;
}

export default function QRPage() {
  const { branchId, slug } = useAdmin();
  const { toast } = useToast();
  const [tables, setTables] = useState<TableRow2[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<TableRow2 | null>(null);
  const generalQrRef = useRef<HTMLDivElement>(null);
  const cardQrRef = useRef<HTMLDivElement>(null);

  const menuUrl = `${window.location.origin}/${slug}/menu`;

  const fetchTables = async () => {
    const { data } = await supabase
      .from("tables")
      .select("id, number, name, status, qr_token")
      .eq("branch_id", branchId)
      .order("number");
    setTables(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchTables(); }, [branchId]);

  const downloadQrFromRef = (ref: React.RefObject<HTMLDivElement>, filename: string) => {
    const canvas = ref.current?.querySelector("canvas");
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const downloadCardQr = () => {
    const canvas = cardQrRef.current?.querySelector("canvas");
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tarjeta-mesa-${selectedTable?.number}-qr.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const printAllCards = () => {
    window.print();
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  const tablesWithToken = tables.filter((t) => t.qr_token);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-foreground">Códigos QR</h2>

      {/* ── QR MENÚ GENERAL ── */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">QR Menú General</CardTitle>
          </div>
          <CardDescription>
            Este QR va <strong>pegado en cada mesa</strong>. Al escanearlo, el cliente accede al menú del restaurante. Es único para todas las mesas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div ref={generalQrRef} className="bg-white rounded-xl p-4 shadow-sm border border-border">
              <QRCodeCanvas value={menuUrl} size={200} level="H" includeMargin />
            </div>
            <div className="flex-1 space-y-3 text-center sm:text-left">
              <p className="text-sm font-mono text-muted-foreground break-all bg-muted rounded-lg px-3 py-2">{menuUrl}</p>
              <p className="text-sm text-muted-foreground">Imprime este QR y pégalo en todas las mesas de tu local. Los clientes podrán ver el menú escaneándolo.</p>
              <div className="flex gap-2 justify-center sm:justify-start">
                <Button variant="outline" size="sm" onClick={() => downloadQrFromRef(generalQrRef, `qr-menu-${slug}.png`)}>
                  <Download className="h-4 w-4 mr-1" />Descargar PNG
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-1" />Imprimir
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── QR TARJETAS POR MESA ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">QR Tarjetas por Mesa</CardTitle>
            </div>
            {tablesWithToken.length > 0 && (
              <Button variant="outline" size="sm" onClick={printAllCards}>
                <Printer className="h-4 w-4 mr-1" />Imprimir todas
              </Button>
            )}
          </div>
          <CardDescription>
            Cada mesa tiene un QR único en su <strong>tarjeta</strong>. Se usa para confirmar pedidos, llamar al mozo y pedir la cuenta. Se generan automáticamente al crear una mesa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tables.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <QrCode className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Aún no hay mesas. Crea una mesa en la sección <strong>Mesas</strong> y su QR tarjeta se generará automáticamente.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mesa</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-bold">{t.number}</TableCell>
                    <TableCell>{t.name ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{t.status}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {t.qr_token ? t.qr_token.slice(0, 8) + "…" : "—"}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setSelectedTable(t)} disabled={!t.qr_token}>
                        <QrCode className="h-4 w-4 mr-1" />Ver QR
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal QR Tarjeta */}
      <Dialog open={!!selectedTable} onOpenChange={() => setSelectedTable(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              QR Tarjeta · Mesa {selectedTable?.number}
              {selectedTable?.name ? ` · ${selectedTable.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div ref={cardQrRef} className="flex flex-col items-center py-4">
            <QRCodeCanvas value={selectedTable?.qr_token || ""} size={256} level="H" includeMargin />
            <p className="mt-3 text-center text-sm font-semibold text-foreground">
              Escanea para confirmar tu pedido ✅
            </p>
          </div>
          <p className="text-center text-xs text-muted-foreground font-mono break-all">
            {selectedTable?.qr_token}
          </p>
          <div className="flex gap-2 justify-center mt-2">
            <Button variant="outline" onClick={downloadCardQr}><Download className="h-4 w-4 mr-1" />Descargar PNG</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Imprimir</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print-all cards (hidden, visible only on print) */}
      <div className="hidden print:block">
        <style>{`@media print { body > *:not(.print-qr-grid) { display: none !important; } .print-qr-grid { display: grid !important; } }`}</style>
        <div className="print-qr-grid grid grid-cols-3 gap-8 p-8">
          {tablesWithToken.map((t) => (
            <div key={t.id} className="flex flex-col items-center border border-border rounded-lg p-4 break-inside-avoid">
              <QRCodeCanvas value={t.qr_token!} size={180} level="H" includeMargin />
              <p className="mt-2 text-lg font-bold">Mesa {t.number}</p>
              {t.name && <p className="text-sm text-muted-foreground">{t.name}</p>}
              <p className="text-xs text-muted-foreground mt-1">Escanea para confirmar ✅</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
