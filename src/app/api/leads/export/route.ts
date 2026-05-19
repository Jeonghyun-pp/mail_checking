import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";

/** Download all of the current user's leads as a CSV file. */
export async function GET() {
  const user = await getCurrentUser();
  const leads = await prisma.lead.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const csv = toCsv([
    ["email", "firstName", "lastName", "company", "position", "verifyStatus"],
    ...leads.map((l) => [
      l.email,
      l.firstName,
      l.lastName,
      l.company,
      l.position,
      l.verifyStatus,
    ]),
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads.csv"',
    },
  });
}
