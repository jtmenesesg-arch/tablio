import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Eres el asistente virtual de soporte de tablio, un software de gestión para restaurantes. Tu nombre es "Soporte tablio".

Información del software tablio:
- tablio es un sistema de gestión integral para restaurantes que incluye: menú digital con QR, gestión de mesas, pedidos en tiempo real, panel de cocina (KDS), panel de mozos, reportes y análisis.
- Los clientes escanean un código QR en la mesa para ver el menú, hacer pedidos y pedir la cuenta.
- El panel de administración permite gestionar mesas, menú, equipo (mozos), ver reportes de ventas, y configurar la sucursal.
- El KDS (Kitchen Display System) muestra los pedidos en cocina en tiempo real.
- Los mozos tienen su propia app donde ven las mesas asignadas, pedidos listos para entregar, y solicitudes de cuenta.
- Los reportes incluyen: ventas, pedidos, mesas, equipo, menú y clientes.
- Se pueden generar códigos QR personalizados por mesa.
- El sistema soporta modificadores de productos (extras, opciones), categorías de menú, y estados de stock.
- Los precios están en pesos chilenos (CLP).
- El contacto de soporte humano es: +56938959429
- Para problemas técnicos graves, recomienda contactar al número de soporte directamente.

Reglas:
- Responde siempre en español.
- Sé amable, conciso y útil.
- Si no sabes algo, sugiere contactar al soporte humano al +56938959429.
- No inventes funcionalidades que no existen.
- Puedes ayudar con: uso del panel admin, configuración de menú, gestión de mesas, reportes, problemas comunes, y dudas generales sobre el software.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas solicitudes, intenta de nuevo en unos segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Servicio no disponible temporalmente." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Error en el servicio de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("support-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
