import { NextResponse } from "next/server";
import { signupSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { hashPassword, signSessionToken } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session-cookie";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { email, password, name, inviteCode } = parsed.data;

  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 },
    );
  }

  const passwordHash = hashPassword(password);
  const userCount = await prisma.user.count();
  let user;

  if (userCount === 0) {
    // Bootstrap: the very first account becomes the workspace admin.
    user = await prisma.user.create({
      data: { email, name: name ?? null, passwordHash, role: "ADMIN" },
    });
  } else {
    if (!inviteCode) {
      return NextResponse.json(
        { error: "An invite code is required to join" },
        { status: 403 },
      );
    }
    try {
      // Consume the code and create the member atomically.
      user = await prisma.$transaction(async (tx) => {
        const invite = await tx.inviteCode.findFirst({
          where: { code: inviteCode.trim(), usedAt: null },
        });
        if (!invite) throw new Error("INVALID_CODE");
        await tx.inviteCode.update({
          where: { id: invite.id },
          data: { usedByEmail: email, usedAt: new Date() },
        });
        return tx.user.create({
          data: { email, name: name ?? null, passwordHash, role: "MEMBER" },
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === "INVALID_CODE") {
        return NextResponse.json(
          { error: "Invalid or already-used invite code" },
          { status: 403 },
        );
      }
      throw err;
    }
  }

  const token = await signSessionToken(user.id);
  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
  });
  setSessionCookie(res, token);
  return res;
}
