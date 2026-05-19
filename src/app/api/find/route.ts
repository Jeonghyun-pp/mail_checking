import { NextResponse } from "next/server";
import { findSchema } from "@/lib/validation";
import { findEmail } from "@/lib/finder/finder";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
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
