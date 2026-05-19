import { NextResponse } from "next/server";
import { emailAccountSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";

/** Email accounts for the current user (SMTP password omitted from output). */
export async function GET() {
  const user = await getCurrentUser();
  const accounts = await prisma.emailAccount.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    omit: { smtpPassword: true },
  });
  return NextResponse.json({ accounts });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = emailAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();
  const account = await prisma.emailAccount.create({
    data: { ...parsed.data, userId: user.id },
    omit: { smtpPassword: true },
  });
  return NextResponse.json({ account }, { status: 201 });
}
