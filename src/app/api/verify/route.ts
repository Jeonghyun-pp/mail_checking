import { NextResponse } from "next/server";
import { verifySchema } from "@/lib/validation";
import { verifyEmail } from "@/lib/verify/verifier";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
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
