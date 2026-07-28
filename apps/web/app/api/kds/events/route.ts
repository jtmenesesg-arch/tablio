import { subscribeKdsEvents } from "../../../../lib/kds-event-hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

export function GET(request: Request) {
  let unsubscribe: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
        ),
      );
      unsubscribe = subscribeKdsEvents((event) => {
        try {
          controller.enqueue(encoder.encode(event));
        } catch {
          unsubscribe();
        }
      });
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
            ),
          );
        } catch {
          unsubscribe();
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 15_000);
      request.signal.addEventListener(
        "abort",
        () => {
          unsubscribe();
          if (heartbeat) clearInterval(heartbeat);
        },
        { once: true },
      );
    },
    cancel() {
      unsubscribe();
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
