import { useState, useRef, useEffect, useCallback } from "react";
import { useAdmin } from "@/contexts/AdminContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Send, Phone, MessageCircle, Ticket, Bot, Loader2 } from "lucide-react";

/* ─── Types ─── */
type Msg = { role: "user" | "assistant"; content: string };

/* ─── Chat streaming helper ─── */
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-chat`;

async function streamChat({
  messages,
  onDelta,
  onDone,
}: {
  messages: Msg[];
  onDelta: (t: string) => void;
  onDone: () => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages }),
  });
  if (!resp.ok || !resp.body) throw new Error("Stream failed");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;

  while (!done) {
    const { done: rd, value } = await reader.read();
    if (rd) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { done = true; break; }
      try {
        const p = JSON.parse(json);
        const c = p.choices?.[0]?.delta?.content as string | undefined;
        if (c) onDelta(c);
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
  }
  onDone();
}

/* ─── Component ─── */
export default function SoportePage() {
  const { tenantId, tenantName } = useAdmin();
  const { toast } = useToast();

  // Ticket form
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("medium");
  const [sending, setSending] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<Msg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  /* ── Submit ticket ── */
  const handleSubmitTicket = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({ title: "Completa todos los campos", variant: "destructive" });
      return;
    }
    setSending(true);
    const { error } = await supabase.from("support_tickets" as any).insert({
      tenant_id: tenantId,
      subject: subject.trim(),
      message: message.trim(),
      priority,
    } as any);
    setSending(false);
    if (error) {
      toast({ title: "Error al enviar ticket", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Ticket enviado", description: "Te contactaremos pronto." });
      setSubject("");
      setMessage("");
      setPriority("medium");
    }
  };

  /* ── Send chat ── */
  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isStreaming) return;
    const userMsg: Msg = { role: "user", content: text };
    setChatInput("");
    setChatMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setChatMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: [...chatMessages, userMsg],
        onDelta: upsert,
        onDone: () => setIsStreaming(false),
      });
    } catch {
      setIsStreaming(false);
      toast({ title: "Error en el chat", variant: "destructive" });
    }
  }, [chatInput, chatMessages, isStreaming, toast]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Soporte</h1>
        <p className="text-sm text-muted-foreground">Obtén ayuda rápida o crea un ticket de soporte</p>
      </div>

      {/* Contact info card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-4 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Phone className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground">Línea directa de soporte</p>
            <a
              href="https://wa.me/56938959429"
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-bold text-primary hover:underline"
            >
              +56 9 3895 9429
            </a>
            <p className="text-xs text-muted-foreground">WhatsApp · Lun-Vie 9:00-19:00</p>
          </div>
          <a
            href="https://wa.me/56938959429"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </Button>
          </a>
        </CardContent>
      </Card>

      <Tabs defaultValue="chat" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="chat" className="gap-2">
            <Bot className="h-4 w-4" />
            Asistente IA
          </TabsTrigger>
          <TabsTrigger value="ticket" className="gap-2">
            <Ticket className="h-4 w-4" />
            Crear ticket
          </TabsTrigger>
        </TabsList>

        {/* ── AI Chat ── */}
        <TabsContent value="chat">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                Asistente tablio
              </CardTitle>
              <CardDescription>
                Pregúntame sobre el uso del sistema, configuración, reportes o cualquier duda.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Messages */}
              <div className="h-[360px] overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="flex h-full items-center justify-center text-center">
                    <div className="space-y-2">
                      <Bot className="h-10 w-10 text-muted-foreground mx-auto" />
                      <p className="text-sm text-muted-foreground">
                        ¡Hola! Soy el asistente de tablio.<br />
                        ¿En qué puedo ayudarte?
                      </p>
                      <div className="flex flex-wrap justify-center gap-2 pt-2">
                        {["¿Cómo configuro el menú?", "¿Cómo genero los QR?", "¿Cómo veo los reportes?"].map(q => (
                          <button
                            key={q}
                            onClick={() => { setChatInput(q); }}
                            className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-card border border-border text-foreground rounded-bl-md"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {isStreaming && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
                  <div className="flex justify-start">
                    <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Escribe tu pregunta..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }}}
                  disabled={isStreaming}
                  className="flex-1"
                />
                <Button onClick={sendChat} disabled={isStreaming || !chatInput.trim()} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Ticket form ── */}
        <TabsContent value="ticket">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Ticket className="h-5 w-5 text-primary" />
                Nuevo ticket de soporte
              </CardTitle>
              <CardDescription>
                Describe tu problema y te responderemos lo antes posible.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Asunto</label>
                <Input
                  placeholder="Ej: No puedo agregar productos al menú"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Prioridad</label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">
                      <span className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">Baja</Badge>
                        Consulta general
                      </span>
                    </SelectItem>
                    <SelectItem value="medium">
                      <span className="flex items-center gap-2">
                        <Badge className="text-xs bg-amber-500">Media</Badge>
                        Problema que afecta operación
                      </span>
                    </SelectItem>
                    <SelectItem value="high">
                      <span className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-xs">Alta</Badge>
                        Sistema caído o error crítico
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Descripción</label>
                <Textarea
                  placeholder="Describe el problema en detalle. Incluye pasos para reproducirlo si es posible..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={5}
                />
              </div>

              <Button
                onClick={handleSubmitTicket}
                disabled={sending || !subject.trim() || !message.trim()}
                className="w-full gap-2"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar ticket
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Para urgencias, contacta directamente al{" "}
                <a href="https://wa.me/56938959429" className="text-primary hover:underline font-medium">
                  +56 9 3895 9429
                </a>
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
