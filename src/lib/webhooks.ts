import type { WebhookEvent } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Deliver an event to every active webhook the user has registered for it.
 * Fire-and-forget — failures are logged, never thrown to the caller.
 */
export async function fireWebhooks(
  userId: string,
  event: WebhookEvent,
  payload: unknown,
): Promise<void> {
  const hooks = await prisma.webhook.findMany({
    where: { userId, event, active: true },
  });
  if (hooks.length === 0) return;

  const envelope = JSON.stringify({
    event,
    payload,
    firedAt: new Date().toISOString(),
  });

  await Promise.all(
    hooks.map((hook) =>
      fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: envelope,
        signal: AbortSignal.timeout(8000),
      }).catch((err) =>
        console.error(
          `[webhook] delivery to ${hook.url} failed:`,
          err instanceof Error ? err.message : err,
        ),
      ),
    ),
  );
}
