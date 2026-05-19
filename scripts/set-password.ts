// Admin utility: set (or reset) a user's password.
//   tsx scripts/set-password.ts <email> <password>
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: tsx scripts/set-password.ts <email> <password>");
    process.exit(1);
  }
  await prisma.user.update({
    where: { email },
    data: { passwordHash: hashPassword(password) },
  });
  console.log(`Password updated for ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
