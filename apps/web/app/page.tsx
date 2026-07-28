import Link from "next/link";

export default function Home() {
  return (
    <main className="landing">
      <p className="eyebrow">Tablio · PWA del comensal</p>
      <h1>Pide otra ronda sin levantar la mano.</h1>
      <p>
        Entra a la mesa demo, arma tu pedido y sigue cada comanda por separado.
        El pago es simulado y no mueve dinero real.
      </p>
      <Link className="primaryLink" href="/demo/payments">
        Ver laboratorio financiero
      </Link>
      <Link className="solidButton" href="/mesa/demo-mesa-8">
        Entrar a Mesa 8
      </Link>
    </main>
  );
}
