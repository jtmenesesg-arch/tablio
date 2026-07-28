import Link from "next/link";

export default function Home() {
  return (
    <main className="landing">
      <p className="eyebrow">Tablio · Sprint 1</p>
      <h1>Laboratorio de pagos</h1>
      <p>
        Un entorno controlado para demostrar confirmaciones server-side,
        duplicados, rechazos y reembolsos sin usar una pasarela ni mover plata.
      </p>
      <Link className="primaryLink" href="/demo/payments">
        Abrir demo segura
      </Link>
    </main>
  );
}
