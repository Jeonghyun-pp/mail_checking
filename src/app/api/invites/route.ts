import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/user";

export const runtime = "nodejs";

/** Only admins manage invite codes. */
async function requireAdmin() {
  const user = await requireAuthUser();
  return user.role === "ADMIN" ? user : null;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }
  const invites = await prisma.inviteCode.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ invites });
}

/** Generate a new single-use invite code. */
export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }
  const code = crypto.randomBytes(6).toString("hex");
  const invite = await prisma.inviteCode.create({ data: { code } });
  return NextResponse.json({ invite }, { status: 201 });
}
