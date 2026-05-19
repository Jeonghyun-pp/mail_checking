import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { parseCsv } from "@/lib/csv";

export const runtime = "nodejs";
export const maxDuration = 60;

const importSchema = z.object({ csv: z.string().min(1).max(2_000_000) });

const FIELDS = ["email", "firstname", "lastname", "company", "position"];

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_-]/g, "");
}

/** Bulk-import leads from CSV text. First row may be a header. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing csv" }, { status: 400 });
  }

  const rows = parseCsv(parsed.data.csv);
  if (rows.length === 0) {
    return NextResponse.json({ imported: 0, skipped: 0 });
  }

  // Determine column positions — from a header row if present, else fixed order.
  let dataRows = rows;
  let colIndex: Record<string, number> = {
    email: 0,
    firstname: 1,
    lastname: 2,
    company: 3,
    position: 4,
  };
  const header = rows[0].map(norm);
  if (header.some((h) => h === "email")) {
    colIndex = {};
    header.forEach((h, i) => {
      if (FIELDS.includes(h)) colIndex[h] = i;
    });
    dataRows = rows.slice(1);
  }

  const user = await getCurrentUser();
  let imported = 0;
  let skipped = 0;

  for (const row of dataRows) {
    const cell = (key: string) => {
      const i = colIndex[key];
      return i === undefined ? "" : (row[i] ?? "").trim();
    };
    const email = cell("email").toLowerCase();
    if (!email || !email.includes("@")) {
      skipped += 1;
      continue;
    }
    try {
      await prisma.lead.upsert({
        where: { userId_email: { userId: user.id, email } },
        update: {},
        create: {
          email,
          firstName: cell("firstname") || null,
          lastName: cell("lastname") || null,
          company: cell("company") || null,
          position: cell("position") || null,
          domain: email.split("@")[1] ?? null,
          source: "import",
          userId: user.id,
        },
      });
      imported += 1;
    } catch {
      skipped += 1;
    }
  }

  return NextResponse.json({ imported, skipped });
}
