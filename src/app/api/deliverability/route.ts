import { NextResponse } from "next/server";
import { deliverabilitySchema } from "@/lib/validation";
import { runDeliverabilityTest } from "@/lib/deliverability";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = deliverabilitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await runDeliverabilityTest(parsed.data);
  return NextResponse.json(result);
}
