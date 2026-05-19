import net from "node:net";

export interface SmtpReply {
  code: number;
  text: string;
}

export interface MailboxProbeResult {
  connected: boolean;
  /** RCPT TO outcome for the target address: true = accepted, false = rejected, null = unknown. */
  accepted: boolean | null;
  /** Whether a guaranteed-nonexistent address was also accepted (domain is catch-all). */
  catchAll: boolean | null;
  code?: number;
  message?: string;
}

const CRLF = "\r\n";

/**
 * Minimal SMTP conversation over a raw TCP socket. Used to probe whether a
 * mailbox exists without actually delivering a message (RCPT TO, then RSET).
 */
class SmtpSession {
  private socket: net.Socket;
  private buffer = "";
  private resolver: ((reply: SmtpReply) => void) | null = null;
  private rejecter: ((err: Error) => void) | null = null;

  constructor(socket: net.Socket) {
    this.socket = socket;
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.tryParse();
    });
    this.socket.on("error", (err) => this.rejecter?.(err));
    this.socket.on("close", () =>
      this.rejecter?.(new Error("connection closed")),
    );
  }

  /** A reply is complete when a line matches `NNN ` (space, not hyphen). */
  private tryParse() {
    const lines = this.buffer.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\d{3} /.test(line)) {
        const code = parseInt(line.slice(0, 3), 10);
        const text = lines.slice(0, i + 1).join("\n");
        this.buffer = lines.slice(i + 1).join("\n");
        const resolve = this.resolver;
        this.resolver = null;
        this.rejecter = null;
        resolve?.({ code, text });
        return;
      }
    }
  }

  /** Wait for the next complete reply (used right after connecting). */
  waitForReply(timeoutMs: number): Promise<SmtpReply> {
    return new Promise((resolve, reject) => {
      this.resolver = resolve;
      this.rejecter = reject;
      const timer = setTimeout(
        () => reject(new Error("SMTP reply timeout")),
        timeoutMs,
      );
      const clear = () => clearTimeout(timer);
      const origResolve = resolve;
      this.resolver = (r) => {
        clear();
        origResolve(r);
      };
      this.tryParse();
    });
  }

  /** Send a command and wait for its reply. */
  command(cmd: string, timeoutMs: number): Promise<SmtpReply> {
    this.socket.write(cmd + CRLF);
    return this.waitForReply(timeoutMs);
  }

  close() {
    try {
      this.socket.write("QUIT" + CRLF);
    } catch {
      // ignore
    }
    this.socket.destroy();
  }
}

function randomLocalPart(): string {
  return "no-such-user-" + Math.random().toString(36).slice(2, 12);
}

interface ProbeOptions {
  heloDomain: string;
  mailFrom: string;
  timeoutMs?: number;
  checkCatchAll?: boolean;
}

/**
 * Connect to an MX host and probe whether `email` is deliverable.
 * Port 25 outbound is required; many networks block it, in which case
 * `connected` will be false and the caller should treat the result as UNKNOWN.
 */
export async function probeMailbox(
  mxHost: string,
  email: string,
  opts: ProbeOptions,
): Promise<MailboxProbeResult> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const domain = email.split("@")[1];

  const socket = net.createConnection({ host: mxHost, port: 25 });
  socket.setTimeout(timeoutMs);

  const result: MailboxProbeResult = {
    connected: false,
    accepted: null,
    catchAll: null,
  };

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("timeout", () => reject(new Error("connect timeout")));
      socket.once("error", reject);
    });

    const session = new SmtpSession(socket);

    const greeting = await session.waitForReply(timeoutMs);
    if (greeting.code !== 220) {
      session.close();
      result.code = greeting.code;
      result.message = "unexpected greeting";
      return result;
    }
    result.connected = true;

    const ehlo = await session.command(`EHLO ${opts.heloDomain}`, timeoutMs);
    if (ehlo.code !== 250) {
      await session.command(`HELO ${opts.heloDomain}`, timeoutMs);
    }

    const mailFrom = await session.command(
      `MAIL FROM:<${opts.mailFrom}>`,
      timeoutMs,
    );
    if (mailFrom.code !== 250) {
      session.close();
      result.code = mailFrom.code;
      result.message = "MAIL FROM rejected";
      return result;
    }

    const rcpt = await session.command(`RCPT TO:<${email}>`, timeoutMs);
    result.code = rcpt.code;
    result.message = rcpt.text;
    result.accepted = rcpt.code >= 200 && rcpt.code < 300;

    if (opts.checkCatchAll) {
      await session.command("RSET", timeoutMs);
      const fake = `${randomLocalPart()}@${domain}`;
      const fakeRcpt = await session.command(`RCPT TO:<${fake}>`, timeoutMs);
      result.catchAll = fakeRcpt.code >= 200 && fakeRcpt.code < 300;
    }

    session.close();
    return result;
  } catch (err) {
    socket.destroy();
    result.message = err instanceof Error ? err.message : String(err);
    return result;
  }
}
