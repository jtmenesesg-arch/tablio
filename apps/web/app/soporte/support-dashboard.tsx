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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import {
  supportTicketCategoryLabels,
  supportTicketStatusDictionary,
} from "@/lib/ui-statuses";

const navItems = ownerNavigation("support");

type Ticket = {
  id: string;
  subject: string;
  category: keyof typeof supportTicketCategoryLabels;
  status: keyof typeof supportTicketStatusDictionary;
  created_at: string;
  updated_at: string;
};

type Message = {
  id: string;
  author_type: "owner" | "platform";
  body: string;
  created_at: string;
};

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function NewTicketDialog({
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
            const response = await fetch("/api/soporte", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                subject: String(formData.get("subject") ?? ""),
                category: String(formData.get("category") ?? "other"),
                message: String(formData.get("message") ?? ""),
              }),
            });
            setBusy(false);
            if (!response.ok) {
              const payload = await readJson<{ error?: string }>(response);
              setError(payload.error ?? "No pudimos crear el ticket.");
              return;
            }
            onOpenChange(false);
            onCreated();
          }}
        >
          <DialogHeader>
            <DialogTitle>Nuevo ticket de soporte</DialogTitle>
          </DialogHeader>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <label className="block space-y-2 text-small font-bold">
            <span>Asunto</span>
            <Input name="subject" required />
          </label>
          <label className="block space-y-2 text-small font-bold">
            <span>Categoría</span>
            <Select defaultValue="other" name="category">
              <option value="billing">Facturación</option>
              <option value="technical">Técnico</option>
              <option value="other">Otro</option>
            </Select>
          </label>
          <label className="block space-y-2 text-small font-bold">
            <span>Cuéntanos qué pasa</span>
            <Textarea minLength={3} name="message" required rows={4} />
          </label>
          <Button className="w-full" disabled={busy} type="submit">
            {busy ? "Enviando…" : "Enviar ticket"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TicketDetail({
  ticketId,
  onBack,
  onChanged,
}: {
  ticketId: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [ticket, setTicket] = useState<Ticket>();
  const [messages, setMessages] = useState<Message[]>();
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/soporte/${ticketId}`, { cache: "no-store" });
    if (!response.ok) {
      const payload = await readJson<{ error?: string }>(response);
      setError(payload.error ?? "No pudimos cargar el ticket.");
      return;
    }
    const payload = await readJson<{ ticket: Ticket; messages: Message[] }>(response);
    setTicket(payload.ticket);
    setMessages(payload.messages);
  }, [ticketId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  async function sendReply() {
    if (!reply.trim()) return;
    setSending(true);
    await fetch(`/api/soporte/${ticketId}/mensajes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: reply }),
    });
    setReply("");
    setSending(false);
    await load();
    onChanged();
  }

  async function setStatus(nextStatus: string) {
    setStatusBusy(true);
    await fetch(`/api/soporte/${ticketId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setStatusBusy(false);
    await load();
    onChanged();
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!ticket || !messages) return <Card><CardContent className="py-12 text-center">Cargando…</CardContent></Card>;

  const state = supportTicketStatusDictionary[ticket.status];

  return (
    <div className="space-y-6">
      <Button onClick={onBack} type="button" variant="outline">
        ← Volver a mis tickets
      </Button>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-h2 text-foreground">{ticket.subject}</h1>
          <Badge variant={state.tone}>{state.label}</Badge>
        </div>
        <p className="text-small text-muted-foreground">
          {supportTicketCategoryLabels[ticket.category]} · abierto el{" "}
          {formatDateTime(ticket.created_at)}
        </p>
      </div>

      <div className="space-y-3">
        {messages.map((message) => (
          <Card key={message.id}>
            <CardContent className="space-y-1 py-4">
              <p className="text-small font-bold text-foreground">
                {message.author_type === "owner" ? "Tú" : "Soporte Tablio"}
              </p>
              <p className="text-body text-foreground">{message.body}</p>
              <p className="text-small text-muted-foreground">
                {formatDateTime(message.created_at)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 py-4">
          <Textarea
            onChange={(event) => setReply(event.target.value)}
            placeholder="Escribe una respuesta…"
            rows={3}
            value={reply}
          />
          <div className="flex flex-wrap justify-between gap-2">
            <Button disabled={sending || !reply.trim()} onClick={() => void sendReply()} type="button">
              {sending ? "Enviando…" : "Responder"}
            </Button>
            {ticket.status !== "closed" && ticket.status !== "resolved" ? (
              <Button
                disabled={statusBusy}
                onClick={() => void setStatus("resolved")}
                type="button"
                variant="outline"
              >
                Marcar como resuelto
              </Button>
            ) : null}
            {ticket.status !== "closed" ? (
              <Button
                disabled={statusBusy}
                onClick={() => void setStatus("closed")}
                type="button"
                variant="outline"
              >
                Cerrar ticket
              </Button>
            ) : (
              <Button
                disabled={statusBusy}
                onClick={() => void setStatus("open")}
                type="button"
                variant="outline"
              >
                Reabrir
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function SupportDashboard() {
  const [tickets, setTickets] = useState<Ticket[]>();
  const [error, setError] = useState("");
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/soporte", { cache: "no-store" });
    if (!response.ok) {
      const payload = await readJson<{ error?: string }>(response);
      setError(payload.error ?? "No pudimos cargar tus tickets.");
      return;
    }
    const payload = await readJson<{ tickets: Ticket[] }>(response);
    setTickets(payload.tickets);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  if (!tickets) return <AppShellLoading navItems={navItems} />;

  return (
    <AppShell
      banner="Datos reales de Supabase"
      branchName="Sucursal principal"
      navItems={navItems}
      tenantName="Bar La Virgen"
    >
      {selectedId ? (
        <TicketDetail
          onBack={() => setSelectedId(null)}
          onChanged={() => void load()}
          ticketId={selectedId}
        />
      ) : (
        <div className="space-y-6">
          <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <h1 className="text-h1 tracking-tight text-foreground lg:text-h1-lg">
                Soporte
              </h1>
              <p className="text-body text-muted-foreground">
                Escríbele a Tablio cuando algo no funcione o tengas una duda.
              </p>
            </div>
            <Button onClick={() => setNewTicketOpen(true)} type="button">
              Nuevo ticket
            </Button>
          </header>

          {error ? <Alert tone="danger">{error}</Alert> : null}

          {tickets.length === 0 ? (
            <Card>
              <CardContent className="space-y-2 py-12 text-center">
                <h2 className="text-h2">Todavía no tienes tickets</h2>
                <p className="text-body text-muted-foreground">
                  Cuando escribas a soporte, tu historial va a aparecer aquí.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => {
                const state = supportTicketStatusDictionary[ticket.status];
                return (
                  <Card key={ticket.id}>
                    <button
                      className="block w-full text-left"
                      onClick={() => setSelectedId(ticket.id)}
                      type="button"
                    >
                      <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-body font-bold text-foreground">
                              {ticket.subject}
                            </p>
                            <Badge variant={state.tone}>{state.label}</Badge>
                          </div>
                          <p className="text-small text-muted-foreground">
                            {supportTicketCategoryLabels[ticket.category]} · actualizado{" "}
                            {formatDateTime(ticket.updated_at)}
                          </p>
                        </div>
                      </CardContent>
                    </button>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <NewTicketDialog
        onCreated={() => void load()}
        onOpenChange={setNewTicketOpen}
        open={newTicketOpen}
      />
    </AppShell>
  );
}
