import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signSessionToken } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session-cookie";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Same response whether the email or the password is wrong.
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  const token = await signSessionToken(user.id);
  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
  });
  setSessionCookie(res, token);
  return res;
}
