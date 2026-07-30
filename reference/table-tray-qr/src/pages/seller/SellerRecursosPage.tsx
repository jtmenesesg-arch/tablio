import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, Mail, FileText, MessageSquare, Shield, BookOpen } from 'lucide-react';

const RESOURCES = [
  {
    title: 'Script de visita fría',
    icon: MessageSquare,
    content: `1. Presentación: "Hola, soy [nombre] de Tablio. ¿Tienes 2 minutos?"
2. Problema: "¿Tus clientes esperan mucho para pedir? ¿Pierdes pedidos en hora punta?"
3. Solución: "Con Tablio, tus clientes piden desde su celular con un QR. Sin app, sin descargas."
4. Prueba social: "Ya lo usan X restaurantes en [zona]. Reducen tiempos de espera un 40%."
5. Cierre: "¿Te gustaría ver una demo de 10 minutos? No tiene costo."`,
  },
  {
    title: 'Respuestas a objeciones',
    icon: Shield,
    items: [
      { q: '"Es muy caro"', a: 'El plan básico sale $299 USD/mes. Con 2 mesas más rotadas por día ya se paga solo.' },
      { q: '"Mis clientes no usan tecnología"', a: 'Es un QR, no una app. Cualquiera que tenga celular con cámara puede usarlo. Sin descargas.' },
      { q: '"Ya tengo un sistema"', a: '¿Tu sistema actual permite que el cliente pida solo? Tablio complementa, no reemplaza tu POS.' },
      { q: '"No tengo tiempo para instalarlo"', a: 'El onboarding toma menos de 1 hora. Nosotros subimos tu menú y te capacitamos gratis.' },
      { q: '"Quiero pensarlo"', a: 'Perfecto, ¿puedo llamarte el [día]? Te dejo la propuesta para que la revises tranquilo.' },
    ],
  },
  {
    title: 'Propuesta comercial',
    icon: FileText,
    content: `Planes Tablio:
• Solo Menú: $149 USD/mes — Menú digital QR, hasta 5 mesas
• Restaurante: $299 USD/mes — Pedidos, KDS, equipo, hasta 20 mesas
• Cadena: $599 USD/mes — Multi-sucursal, reportes, ilimitado

Todos incluyen: onboarding gratis, soporte WhatsApp, actualizaciones.
Piloto gratis de 14 días sin compromiso.`,
  },
];

const CONTACTS = [
  { name: 'Jefe de Ventas', role: 'Supervisión comercial', phone: '+56 9 1234 5678', email: 'jefe@tablio.cl' },
  { name: 'Fundador', role: 'Decisiones estratégicas', phone: '+56 9 8765 4321', email: 'fundador@tablio.cl' },
];

export default function SellerRecursosPage() {
  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-lg font-bold text-foreground">Recursos</h1>

      {RESOURCES.map((res, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <res.icon className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">{res.title}</h2>
            </div>
            {res.content && (
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
                {res.content}
              </pre>
            )}
            {res.items && (
              <div className="space-y-3">
                {res.items.map((item, j) => (
                  <div key={j}>
                    <p className="text-xs font-medium text-foreground">{item.q}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">→ {item.a}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Contacts */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          Contactos clave
        </h2>
        {CONTACTS.map((c, i) => (
          <Card key={i} className="mb-2">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.role}</p>
                </div>
                <div className="flex gap-2">
                  <a href={`tel:${c.phone}`} className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Phone className="w-4 h-4 text-primary" />
                  </a>
                  <a href={`mailto:${c.email}`} className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-primary" />
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
