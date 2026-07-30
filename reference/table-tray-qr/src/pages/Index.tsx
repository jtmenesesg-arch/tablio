import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { QrCode, ChefHat, BarChart3, Building2, ArrowRight, Zap, Clock, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: QrCode,
    title: "Menú QR digital",
    desc: "Tus clientes escanean, exploran y piden desde su celular. Sin apps, sin esperas.",
  },
  {
    icon: Zap,
    title: "Pedidos en tiempo real",
    desc: "Cada pedido llega directo a cocina al instante. Sin errores, sin papeles.",
  },
  {
    icon: ChefHat,
    title: "Pantalla de cocina (KDS)",
    desc: "Tu equipo ve los pedidos organizados y listos para preparar en una sola pantalla.",
  },
  {
    icon: Building2,
    title: "Multi-sucursal",
    desc: "Gestiona todas tus sucursales, menús y equipos desde un solo lugar.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

export default function Index() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center px-6 pt-20 pb-16 md:pt-32 md:pb-24">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Smartphone className="w-4 h-4" />
            tablio — la forma moderna de atender
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-4">
            Tu restaurante,{" "}
            <span className="text-primary">sin fricciones</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-xl mb-8">
            tablio digitaliza pedidos, conecta tu cocina en tiempo real y te da el control total de tu operación. Todo desde un QR.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              size="lg"
              className="gap-2 text-base px-8"
              onClick={() => navigate("/admin/login")}
            >
              Soy restaurante
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="gap-2 text-base px-8"
              onClick={() => navigate("/mozo/login")}
            >
              Soy mozo
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 md:py-24 max-w-5xl mx-auto">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-2xl md:text-3xl font-bold text-center mb-12"
        >
          Todo lo que necesitas para{" "}
          <span className="text-primary">operar mejor</span>
        </motion.h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="group relative p-6 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-1">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="px-6 py-16 bg-secondary text-secondary-foreground">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "0s", label: "Tiempo de espera" },
            { value: "100%", label: "Digital" },
            { value: "∞", label: "Mesas soportadas" },
            { value: "24/7", label: "Disponible" },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              <div className="text-3xl md:text-4xl font-bold text-primary mb-1">{s.value}</div>
              <div className="text-sm text-secondary-foreground/70">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-lg mx-auto"
        >
          <Clock className="w-8 h-8 text-primary mx-auto mb-4" />
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Empieza en minutos
          </h2>
          <p className="text-muted-foreground mb-6">
            Crea tu cuenta, sube tu menú y genera los QR. Así de simple.
          </p>
          <Button size="lg" className="gap-2" onClick={() => navigate("/admin/login")}>
            Comenzar gratis
            <ArrowRight className="w-4 h-4" />
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <QrCode className="w-4 h-4 text-primary" />
            tablio.
          </div>
          <p>© {new Date().getFullYear()} tablio. Todos los derechos reservados.</p>
          <button
            onClick={() => navigate("/superadmin")}
            className="text-muted-foreground/40 hover:text-muted-foreground text-xs transition-colors"
          >
            SA
          </button>
        </div>
      </footer>
    </div>
  );
}
