import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/user";

export const runtime = "nodejs";

/** Current signed-in user, or null. Used by the app shell. */
export async function GET() {
  const user = await getOptionalUser();
  return NextResponse.json({
    user: user
      ? { id: user.id, email: user.email, name: user.name, role: user.role }
      : null,
  });
}
