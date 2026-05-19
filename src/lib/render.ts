import type { Lead } from "@prisma/client";

// Spin syntax: {option one|option two|option three} -> one option at random.
// Requires a pipe so it never collides with {{variable}} placeholders.
const SPIN_RE = /\{([^{}]*\|[^{}]*)\}/g;

function spin(text: string): string {
  return text.replace(SPIN_RE, (_, group: string) => {
    const options = group.split("|");
    return options[Math.floor(Math.random() * options.length)];
  });
}

/**
 * Render an email template: substitute {{variable}} placeholders with lead
 * fields, then resolve any {a|b|c} spin blocks to one random option.
 */
export function renderTemplate(text: string, lead: Lead): string {
  const vars: Record<string, string> = {
    firstName: lead.firstName ?? "there",
    lastName: lead.lastName ?? "",
    company: lead.company ?? "",
    email: lead.email,
    position: lead.position ?? "",
  };
  const withVars = text.replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_, key) => vars[key] ?? "",
  );
  return spin(withVars);
}

const URL_RE = /(https?:\/\/[^\s<>"]+)/g;
const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESC[c]);
}

interface TrackingContext {
  recipientId: string;
  stepId: string;
  appUrl: string;
}

/**
 * Turn a plain-text email body into tracked HTML: links become click-tracking
 * redirects, a 1x1 open pixel is appended, and a one-click unsubscribe footer
 * is added for compliance.
 */
export function toTrackedHtml(plainBody: string, ctx: TrackingContext): string {
  const base = `${ctx.appUrl}/api/track`;

  const htmlBody = escapeHtml(plainBody)
    .replace(URL_RE, (url) => {
      const tracked = `${base}/click/${ctx.recipientId}/${ctx.stepId}?url=${encodeURIComponent(url)}`;
      return `<a href="${tracked}">${url}</a>`;
    })
    .replace(/\r?\n/g, "<br>");

  const pixel = `<img src="${base}/open/${ctx.recipientId}/${ctx.stepId}" width="1" height="1" alt="" style="display:none">`;

  const footer = `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af">If you'd rather not hear from us, <a href="${base}/unsub/${ctx.recipientId}" style="color:#9ca3af">unsubscribe</a>.</div>`;

  return `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#1a1d21">${htmlBody}${pixel}${footer}</body></html>`;
}

/** Plain-text fallback (variables already substituted upstream). */
export function toPlainText(body: string): string {
  return body;
}
