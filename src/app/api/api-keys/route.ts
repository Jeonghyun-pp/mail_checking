import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { generateApiKey } from "@/lib/apikey";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  dailyLimit: z.number().int().min(10).max(100000).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    // The hash is a secret — never return it.
    omit: { hash: true },
  });
  return NextResponse.json({ keys });
}

/** Create a key. The plaintext value is returned once and never again. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const user = await getCurrentUser();
  const { key, hash, prefix } = generateApiKey();

  const record = await prisma.apiKey.create({
    data: {
      name: parsed.data.name,
      hash,
      prefix,
      dailyLimit: parsed.data.dailyLimit ?? 1000,
      userId: user.id,
    },
    omit: { hash: true },
  });

  // `key` is included only in this create response.
  return NextResponse.json({ apiKey: record, key }, { status: 201 });
}
