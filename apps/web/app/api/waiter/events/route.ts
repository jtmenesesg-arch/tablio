import { subscribeKdsEvents } from "../../../../lib/kds-event-hub";
import { subscribeWaiterEvents } from "../../../../lib/waiter-event-hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

export function GET(request: Request) {
  let unsubscribeWaiter = () => {};
  let unsubscribeKds = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string) => {
        try {
          controller.enqueue(encoder.encode(event));
        } catch {
          unsubscribeWaiter();
          unsubscribeKds();
        }
      };
      send(
        `event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
      );
      unsubscribeWaiter = subscribeWaiterEvents(send);
      unsubscribeKds = subscribeKdsEvents(send);
      heartbeat = setInterval(() => {
        send(
          `event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
        );
      }, 15_000);
      request.signal.addEventListener(
        "abort",
        () => {
          unsubscribeWaiter();
          unsubscribeKds();
          if (heartbeat) clearInterval(heartbeat);
        },
        { once: true },
      );
    },
    cancel() {
      unsubscribeWaiter();
      unsubscribeKds();
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
