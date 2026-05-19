import { NextResponse } from "next/server";
import { verifySchema } from "@/lib/validation";
import { verifyEmail } from "@/lib/verify/verifier";
import { authenticateApiKey } from "@/lib/apikey";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Public API — verify a single email address. Requires an API key. */
export async function POST(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const outcome = await verifyEmail(parsed.data.email);
  return NextResponse.json(outcome);
}
