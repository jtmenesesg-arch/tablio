import { subscribeCashierEvents } from "../../../../lib/cashier-event-hub";
import { subscribeKdsEvents } from "../../../../lib/kds-event-hub";
import { subscribeWaiterEvents } from "../../../../lib/waiter-event-hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

export function GET(request: Request) {
  const unsubscribers: Array<() => void> = [];
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string) => {
        try {
          controller.enqueue(encoder.encode(event));
        } catch {
          for (const unsubscribe of unsubscribers) unsubscribe();
        }
      };
      send(
        `event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
      );
      unsubscribers.push(
        subscribeCashierEvents(send),
        subscribeKdsEvents(send),
        subscribeWaiterEvents(send),
      );
      heartbeat = setInterval(() => {
        send(
          `event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
        );
      }, 15_000);
      request.signal.addEventListener(
        "abort",
        () => {
          for (const unsubscribe of unsubscribers) unsubscribe();
          if (heartbeat) clearInterval(heartbeat);
        },
        { once: true },
      );
    },
    cancel() {
      for (const unsubscribe of unsubscribers) unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream",
      "x-accel-buffering": "no",
    },
  });
}
