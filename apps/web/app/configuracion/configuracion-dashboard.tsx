"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell, AppShellLoading } from "@/components/operational/app-shell";
import { ownerNavigation } from "@/components/operational/owner-navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatClp } from "@/lib/format";

const navItems = ownerNavigation("configure");

type Zone = {
  id: string;
  code: string;
  name: string;
  zone_type: string;
  active: boolean;
};

type Station = {
  id: string;
  code: string;
  name: string;
  station_type: string;
  active: boolean;
};

type TableRow = {
  id: string;
  table_number: string;
  display_name: string;
  capacity: number;
  qr_active: boolean;
  zone_id: string;
  zones: { name: string } | null;
};

type Category = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  active: boolean;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  unit_price_clp: number;
  allergens: string[];
  track_stock: boolean;
  available_for_order: boolean;
  menu_category_id: string | null;
  menu_categories: { name: string } | null;
  inventory_levels: Array<{ on_hand_quantity: number }>;
};

type Tab = "zonas" | "estaciones" | "mesas" | "carta";

const TAB_LABELS: Record<Tab, string> = {
  zonas: "Zonas",
  estaciones: "Estaciones",
  mesas: "Mesas",
  carta: "Carta",
};

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function NewZoneDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          className="space-y-6"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const formData = new FormData(event.currentTarget);
            const response = await fetch("/api/configuracion/zonas", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                code: String(formData.get("code") ?? ""),
                name: String(formData.get("name") ?? ""),
                zoneType: String(formData.get("zoneType") ?? "general"),
              }),
            });
            setBusy(false);
            if (!response.ok) {
              const payload = await readJson<{ error?: string }>(response);
              setError(payload.error ?? "No pudimos crear la zona.");
              return;
            }
            onOpenChange(false);
            onCreated();
          }}
        >
          <DialogHeader>
            <DialogTitle>Nueva zona</DialogTitle>
          </DialogHeader>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <label className="block space-y-2 text-small font-bold">
            <span>Código (sin espacios, ej: terraza)</span>
            <Input name="code" required />
          </label>
          <label className="block space-y-2 text-small font-bold">
            <span>Nombre</span>
            <Input name="name" required />
          </label>
          <label className="block space-y-2 text-small font-bold">
            <span>Tipo</span>
            <Select defaultValue="general" name="zoneType">
              <option value="general">General</option>
              <option value="outdoor">Exterior</option>
              <option value="indoor">Interior</option>
              <option value="bar">Barra</option>
            </Select>
          </label>
          <Button className="w-full" disabled={busy} type="submit">
            {busy ? "Creando…" : "Crear zona"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewStationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          className="space-y-6"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const formData = new FormData(event.currentTarget);
            const response = await fetch("/api/configuracion/estaciones", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                code: String(formData.get("code") ?? ""),
                name: String(formData.get("name") ?? ""),
                stationType: String(formData.get("stationType") ?? ""),
              }),
            });
            setBusy(false);
            if (!response.ok) {
              const payload = await readJson<{ error?: string }>(response);
              setError(payload.error ?? "No pudimos crear la estación.");
              return;
            }
            onOpenChange(false);
            onCreated();
          }}
        >
          <DialogHeader>
            <DialogTitle>Nueva estación</DialogTitle>
          </DialogHeader>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <label className="block space-y-2 text-small font-bold">
            <span>Código (sin espacios, ej: cocina)</span>
            <Input name="code" required />
          </label>
          <label className="block space-y-2 text-small font-bold">
            <span>Nombre</span>
            <Input name="name" required />
          </label>
          <label className="block space-y-2 text-small font-bold">
            <span>Tipo</span>
            <Select defaultValue="bar" name="stationType">
              <option value="bar">Barra</option>
              <option value="kitchen">Cocina</option>
            </Select>
          </label>
          <Button className="w-full" disabled={busy} type="submit">
            {busy ? "Creando…" : "Crear estación"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewTablesDialog({
  open,
  onOpenChange,
  onCreated,
  zones,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  zones: Zone[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          className="space-y-6"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const formData = new FormData(event.currentTarget);
            const response = await fetch("/api/configuracion/mesas", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                zoneId: String(formData.get("zoneId") ?? ""),
                startNumber: Number(formData.get("startNumber") ?? 1),
                count: Number(formData.get("count") ?? 1),
                namePrefix: String(formData.get("namePrefix") ?? "Mesa"),
                capacity: Number(formData.get("capacity") ?? 4),
              }),
            });
            setBusy(false);
            if (!response.ok) {
              const payload = await readJson<{ error?: string }>(response);
              setError(payload.error ?? "No pudimos crear las mesas.");
              return;
            }
            onOpenChange(false);
            onCreated();
          }}
        >
          <DialogHeader>
            <DialogTitle>Nuevas mesas</DialogTitle>
          </DialogHeader>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <p className="text-small text-muted-foreground">
            Cada mesa que crees aquí genera su propio código QR y su código de
            presencia automáticamente — el mismo mecanismo real de la app.
          </p>
          <label className="block space-y-2 text-small font-bold">
            <span>Zona</span>
            <Select defaultValue="" name="zoneId" required>
              <option disabled value="">
                Elige una zona
              </option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-2 text-small font-bold">
              <span>Número inicial</span>
              <Input defaultValue={1} min={1} name="startNumber" required type="number" />
            </label>
            <label className="block space-y-2 text-small font-bold">
              <span>Cantidad de mesas</span>
              <Input defaultValue={1} max={60} min={1} name="count" required type="number" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-2 text-small font-bold">
              <span>Prefijo de nombre</span>
              <Input defaultValue="Mesa" name="namePrefix" required />
            </label>
            <label className="block space-y-2 text-small font-bold">
              <span>Capacidad por mesa</span>
              <Input defaultValue={4} min={1} name="capacity" required type="number" />
            </label>
          </div>
          <Button className="w-full" disabled={busy} type="submit">
            {busy ? "Creando…" : "Crear mesas"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TableQrDialog({
  table,
  onOpenChange,
}: {
  table: TableRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [working, setWorking] = useState(false);
  const [revealed, setRevealed] = useState<{
    qrToken: string;
    presenceCode: string;
  } | null>(null);
  const [error, setError] = useState("");

  if (!table) return null;

  return (
    <ReasonDialog
      confirmLabel="Revelar QR y código"
      onConfirm={async (reason) => {
        setWorking(true);
        setError("");
        const response = await fetch(`/api/configuracion/mesas/${table.id}/qr`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        setWorking(false);
        if (!response.ok) {
          const payload = await readJson<{ error?: string }>(response);
          setError(payload.error ?? "No pudimos revelar el QR.");
          return;
        }
        const payload = await readJson<{
          qrToken: string;
          presenceCode: string;
        }>(response);
        setRevealed(payload);
      }}
      onOpenChange={(open) => onOpenChange(open)}
      open
      title={`QR y código de ${table.display_name}`}
      description={
        revealed
          ? `Código de presencia: ${revealed.presenceCode}. Token QR: ${revealed.qrToken}`
          : error
            ? error
            : "Revelar el QR queda registrado en la auditoría. Escribe el motivo."
      }
      working={working}
    />
  );
}

function NewCategoryDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          className="space-y-6"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const formData = new FormData(event.currentTarget);
            const response = await fetch("/api/configuracion/categorias", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                code: String(formData.get("code") ?? ""),
                name: String(formData.get("name") ?? ""),
              }),
            });
            setBusy(false);
            if (!response.ok) {
              const payload = await readJson<{ error?: string }>(response);
              setError(payload.error ?? "No pudimos crear la categoría.");
              return;
            }
            onOpenChange(false);
            onCreated();
          }}
        >
          <DialogHeader>
            <DialogTitle>Nueva categoría de carta</DialogTitle>
          </DialogHeader>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <label className="block space-y-2 text-small font-bold">
            <span>Código (sin espacios, ej: cervezas)</span>
            <Input name="code" required />
          </label>
          <label className="block space-y-2 text-small font-bold">
            <span>Nombre</span>
            <Input name="name" required />
          </label>
          <Button className="w-full" disabled={busy} type="submit">
            {busy ? "Creando…" : "Crear categoría"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewProductDialog({
  open,
  onOpenChange,
  onCreated,
  categories,
  stations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  categories: Category[];
  stations: Station[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          className="space-y-6"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const formData = new FormData(event.currentTarget);
            const allergensRaw = String(formData.get("allergens") ?? "");
            const response = await fetch("/api/configuracion/productos", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                menuCategoryId: String(formData.get("menuCategoryId") ?? ""),
                defaultStationId: String(formData.get("defaultStationId") ?? ""),
                name: String(formData.get("name") ?? ""),
                description: String(formData.get("description") ?? ""),
                unitPriceClp: Number(formData.get("unitPriceClp") ?? 0),
                allergens: allergensRaw
                  ? allergensRaw.split(",").map((item) => item.trim()).filter(Boolean)
                  : [],
                trackStock: formData.get("trackStock") === "on",
              }),
            });
            setBusy(false);
            if (!response.ok) {
              const payload = await readJson<{ error?: string }>(response);
              setError(payload.error ?? "No pudimos crear el producto.");
              return;
            }
            onOpenChange(false);
            onCreated();
          }}
        >
          <DialogHeader>
            <DialogTitle>Nuevo producto</DialogTitle>
          </DialogHeader>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <label className="block space-y-2 text-small font-bold">
            <span>Nombre</span>
            <Input name="name" required />
          </label>
          <label className="block space-y-2 text-small font-bold">
            <span>Descripción</span>
            <Textarea name="description" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-2 text-small font-bold">
              <span>Categoría</span>
              <Select defaultValue="" name="menuCategoryId" required>
                <option disabled value="">
                  Elige una categoría
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block space-y-2 text-small font-bold">
              <span>Estación</span>
              <Select defaultValue="" name="defaultStationId" required>
                <option disabled value="">
                  Elige una estación
                </option>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <label className="block space-y-2 text-small font-bold">
            <span>Precio (CLP)</span>
            <Input min={0} name="unitPriceClp" required type="number" />
          </label>
          <label className="block space-y-2 text-small font-bold">
            <span>Alérgenos (separados por coma)</span>
            <Input name="allergens" placeholder="gluten, lácteos" />
          </label>
          <label className="flex items-center gap-2 text-body">
            <input className="size-icon shrink-0" name="trackStock" type="checkbox" />
            Controlar stock para este producto
          </label>
          <Button className="w-full" disabled={busy} type="submit">
            {busy ? "Creando…" : "Crear producto"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfiguracionDashboard() {
  const [tab, setTab] = useState<Tab>("zonas");
  const [zones, setZones] = useState<Zone[]>();
  const [stations, setStations] = useState<Station[]>();
  const [tables, setTables] = useState<TableRow[]>();
  const [categories, setCategories] = useState<Category[]>();
  const [products, setProducts] = useState<Product[]>();
  const [error, setError] = useState("");

  const [newZoneOpen, setNewZoneOpen] = useState(false);
  const [newStationOpen, setNewStationOpen] = useState(false);
  const [newTablesOpen, setNewTablesOpen] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [qrTarget, setQrTarget] = useState<TableRow | null>(null);
  const [availabilityTarget, setAvailabilityTarget] = useState<Product | null>(null);
  const [availabilityWorking, setAvailabilityWorking] = useState(false);

  const loadAll = useCallback(async () => {
    const [zonesRes, stationsRes, tablesRes, categoriesRes, productsRes] =
      await Promise.all([
        fetch("/api/configuracion/zonas", { cache: "no-store" }),
        fetch("/api/configuracion/estaciones", { cache: "no-store" }),
        fetch("/api/configuracion/mesas", { cache: "no-store" }),
        fetch("/api/configuracion/categorias", { cache: "no-store" }),
        fetch("/api/configuracion/productos", { cache: "no-store" }),
      ]);
    if (
      !zonesRes.ok ||
      !stationsRes.ok ||
      !tablesRes.ok ||
      !categoriesRes.ok ||
      !productsRes.ok
    ) {
      setError("No pudimos cargar la configuración del local.");
      return;
    }
    setZones((await readJson<{ zones: Zone[] }>(zonesRes)).zones);
    setStations((await readJson<{ stations: Station[] }>(stationsRes)).stations);
    setTables((await readJson<{ tables: TableRow[] }>(tablesRes)).tables);
    setCategories((await readJson<{ categories: Category[] }>(categoriesRes)).categories);
    setProducts((await readJson<{ products: Product[] }>(productsRes)).products);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadAll(), 0);
    return () => window.clearTimeout(initial);
  }, [loadAll]);

  const loading = !zones || !stations || !tables || !categories || !products;
  if (loading) return <AppShellLoading navItems={navItems} />;

  return (
    <AppShell
      banner="Datos reales de Supabase"
      branchName="Sucursal principal"
      navItems={navItems}
      tenantName="Bar La Virgen"
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-h1 tracking-tight text-foreground lg:text-h1-lg">
            Configuración del local
          </h1>
          <p className="text-body text-muted-foreground">
            Zonas, estaciones, mesas y carta — lo que define cómo funciona tu local.
          </p>
        </header>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="flex flex-wrap gap-2">
          {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
            <Button
              key={key}
              onClick={() => setTab(key)}
              type="button"
              variant={tab === key ? "primary" : "outline"}
            >
              {TAB_LABELS[key]}
            </Button>
          ))}
        </div>

        {tab === "zonas" ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setNewZoneOpen(true)} type="button">
                Nueva zona
              </Button>
            </div>
            <div className="space-y-3">
              {zones.map((zone) => (
                <Card key={zone.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-body font-bold text-foreground">{zone.name}</p>
                      <p className="text-small text-muted-foreground">{zone.zone_type}</p>
                    </div>
                    <Badge variant={zone.active ? "success" : "neutral"}>
                      {zone.active ? "Activa" : "Inactiva"}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "estaciones" ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setNewStationOpen(true)} type="button">
                Nueva estación
              </Button>
            </div>
            <div className="space-y-3">
              {stations.map((station) => (
                <Card key={station.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-body font-bold text-foreground">{station.name}</p>
                      <p className="text-small text-muted-foreground">
                        {station.station_type === "kitchen" ? "Cocina" : "Barra"}
                      </p>
                    </div>
                    <Badge variant={station.active ? "success" : "neutral"}>
                      {station.active ? "Activa" : "Inactiva"}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "mesas" ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setNewTablesOpen(true)} type="button">
                Nuevas mesas
              </Button>
            </div>
            <div className="space-y-3">
              {tables.map((table) => (
                <Card key={table.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-body font-bold text-foreground">
                        {table.display_name}
                      </p>
                      <p className="text-small text-muted-foreground">
                        {table.zones?.name ?? "Sin zona"} · capacidad {table.capacity}
                      </p>
                    </div>
                    <Button
                      onClick={() => setQrTarget(table)}
                      type="button"
                      variant="outline"
                    >
                      Ver QR y código
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "carta" ? (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setNewCategoryOpen(true)} type="button" variant="outline">
                Nueva categoría
              </Button>
              <Button onClick={() => setNewProductOpen(true)} type="button">
                Nuevo producto
              </Button>
            </div>
            {categories.map((category) => {
              const categoryProducts = products.filter(
                (product) => product.menu_category_id === category.id,
              );
              if (categoryProducts.length === 0) return null;
              return (
                <div className="space-y-3" key={category.id}>
                  <h2 className="text-h3 text-foreground">{category.name}</h2>
                  <div className="space-y-3">
                    {categoryProducts.map((product) => {
                      const stock = product.inventory_levels[0]?.on_hand_quantity;
                      return (
                        <Card key={product.id}>
                          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-body font-bold text-foreground">
                                  {product.name}
                                </p>
                                <Badge
                                  variant={product.available_for_order ? "success" : "danger"}
                                >
                                  {product.available_for_order ? "Disponible" : "Agotado"}
                                </Badge>
                                {product.track_stock && stock !== undefined ? (
                                  <Badge variant="warning">Stock: {stock}</Badge>
                                ) : null}
                              </div>
                              <p className="text-small text-muted-foreground">
                                {product.description}
                              </p>
                              {product.allergens.length > 0 ? (
                                <p className="text-small text-muted-foreground">
                                  Alérgenos: {product.allergens.join(", ")}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-3">
                              <p className="text-body font-bold text-foreground">
                                {formatClp(product.unit_price_clp)}
                              </p>
                              <Button
                                onClick={() => setAvailabilityTarget(product)}
                                type="button"
                                variant="outline"
                              >
                                {product.available_for_order
                                  ? "Marcar agotado"
                                  : "Marcar disponible"}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <NewZoneDialog
        onCreated={() => void loadAll()}
        onOpenChange={setNewZoneOpen}
        open={newZoneOpen}
      />
      <NewStationDialog
        onCreated={() => void loadAll()}
        onOpenChange={setNewStationOpen}
        open={newStationOpen}
      />
      <NewTablesDialog
        onCreated={() => void loadAll()}
        onOpenChange={setNewTablesOpen}
        open={newTablesOpen}
        zones={zones}
      />
      <NewCategoryDialog
        onCreated={() => void loadAll()}
        onOpenChange={setNewCategoryOpen}
        open={newCategoryOpen}
      />
      <NewProductDialog
        categories={categories}
        onCreated={() => void loadAll()}
        onOpenChange={setNewProductOpen}
        open={newProductOpen}
        stations={stations}
      />
      {qrTarget ? (
        <TableQrDialog
          key={qrTarget.id}
          onOpenChange={(open) => {
            if (!open) setQrTarget(null);
          }}
          table={qrTarget}
        />
      ) : null}
      {availabilityTarget ? (
        <ReasonDialog
          confirmLabel={
            availabilityTarget.available_for_order ? "Marcar agotado" : "Marcar disponible"
          }
          danger={availabilityTarget.available_for_order}
          description="Este cambio queda registrado en la auditoría. Escribe el motivo."
          onConfirm={async (reason) => {
            setAvailabilityWorking(true);
            await fetch(
              `/api/configuracion/productos/${availabilityTarget.id}/disponibilidad`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  available: !availabilityTarget.available_for_order,
                  reason,
                }),
              },
            );
            setAvailabilityWorking(false);
            setAvailabilityTarget(null);
            void loadAll();
          }}
          onOpenChange={(open) => {
            if (!open) setAvailabilityTarget(null);
          }}
          open
          title={`Disponibilidad de ${availabilityTarget.name}`}
          working={availabilityWorking}
        />
      ) : null}
    </AppShell>
  );
}
