import nodemailer from "nodemailer";
import type { EmailAccount } from "@prisma/client";

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

/** Build a Nodemailer transport from a stored email account. */
export function transportFor(account: EmailAccount) {
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure, // true for 465, false for 587/STARTTLS
    auth: { user: account.smtpUser, pass: account.smtpPassword },
  });
}

/** Verify that the SMTP credentials can authenticate. */
export async function testConnection(
  account: EmailAccount,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await transportFor(account).verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Send one message through the account's SMTP server. */
export async function sendMail(account: EmailAccount, args: SendArgs) {
  const transport = transportFor(account);
  return transport.sendMail({
    from: `"${account.fromName}" <${account.fromEmail}>`,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    headers: args.headers,
  });
}
