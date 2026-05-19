import { NextResponse } from "next/server";
import { findSchema } from "@/lib/validation";
import { findEmail } from "@/lib/finder/finder";
import { authenticateApiKey } from "@/lib/apikey";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Public API — find a person's email from name + domain. Requires an API key. */
export async function POST(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = findSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { firstName, lastName, domain } = parsed.data;
  const result = await findEmail(firstName, lastName, domain);
  return NextResponse.json(result);
}
