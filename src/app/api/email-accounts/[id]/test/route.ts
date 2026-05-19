import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { testConnection } from "@/lib/mailer";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Verify the stored SMTP credentials can authenticate. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const account = await prisma.emailAccount.findFirst({
    where: { id, userId: user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const result = await testConnection(account);
  return NextResponse.json(result);
}
