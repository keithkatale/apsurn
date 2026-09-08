import http from "node:http";
import net from "node:net";
import { resolveMx } from "node:dns/promises";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

const secret = process.env.EMAIL_VERIFIER_SECRET ?? "";
const port = Number(process.env.PORT ?? 8080);
const seen = new Map();
const domainLastCheck = new Map();
const emailPattern = /^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,})$/i;

function authenticated(req, body) {
  const timestamp = req.headers["x-apsurn-timestamp"] ?? "";
  const nonce = req.headers["x-apsurn-nonce"] ?? "";
  const signature = req.headers["x-apsurn-signature"] ?? "";
  if (!secret || !timestamp || !nonce || !signature || Math.abs(Date.now() - Number(timestamp)) > 300_000 || seen.has(nonce)) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  seen.set(nonce, Date.now());
  for (const [key, at] of seen) if (Date.now() - at > 300_000) seen.delete(key);
  return true;
}

function smtpProbe(host, domain, recipient) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: 25 });
    socket.setTimeout(12_000);
    let buffer = ""; let stage = 0; let finished = false;
    const done = (result) => { if (finished) return; finished = true; socket.destroy(); resolve(result); };
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!/^\d{3}[ -]/.test(line) || line[3] === "-") continue;
        const code = Number(line.slice(0, 3));
        if (stage === 0 && code === 220) { socket.write(`EHLO verifier.apsurn.com\r\n`); stage = 1; }
        else if (stage === 1 && code >= 200 && code < 400) { socket.write(`MAIL FROM:<verify@apsurn.com>\r\n`); stage = 2; }
        else if (stage === 2 && code >= 200 && code < 400) { socket.write(`RCPT TO:<${recipient}>\r\n`); stage = 3; }
        else if (stage === 3) { socket.write("QUIT\r\n"); done({ accepted: code >= 200 && code < 300, code, response: line.slice(0, 160) }); }
        else if (code >= 400) done({ accepted: false, code, response: line.slice(0, 160) });
      }
    });
    socket.on("timeout", () => done({ accepted: null, reason: "timeout" }));
    socket.on("error", (error) => done({ accepted: null, reason: error.code ?? "network_error" }));
  });
}

async function verify(email) {
  const match = emailPattern.exec(email);
  if (!match) return { status: "invalid", checks: { syntax: false } };
  const domain = match[1].toLowerCase();
  const last = domainLastCheck.get(domain) ?? 0;
  if (Date.now() - last < 1000) return { status: "risky", checks: { reason: "domain_rate_limited" } };
  domainLastCheck.set(domain, Date.now());
  let mx;
  try { mx = (await resolveMx(domain)).sort((a, b) => a.priority - b.priority); } catch { return { status: "invalid", checks: { syntax: true, mx: false } }; }
  if (!mx.length) return { status: "invalid", checks: { syntax: true, mx: false } };
  const mailbox = await smtpProbe(mx[0].exchange, domain, email);
  if (mailbox.accepted !== true) return { status: mailbox.accepted === false ? "invalid" : "risky", checks: { syntax: true, mx: true, mailbox } };
  const random = `${randomBytes(12).toString("hex")}@${domain}`;
  const catchAll = await smtpProbe(mx[0].exchange, domain, random);
  return { status: catchAll.accepted === true ? "accept_all" : "verified", checks: { syntax: true, mx: true, mailbox, catchAll: catchAll.accepted === true } };
}

http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") { res.writeHead(200).end("ok"); return; }
  if (req.method !== "POST" || req.url !== "/verify") { res.writeHead(404).end(); return; }
  let body = "";
  req.on("data", (chunk) => { body += chunk; if (body.length > 4096) req.destroy(); });
  req.on("end", async () => {
    res.setHeader("content-type", "application/json");
    if (!authenticated(req, body)) { res.writeHead(401).end(JSON.stringify({ error: "unauthorized" })); return; }
    try { const { email } = JSON.parse(body); res.writeHead(200).end(JSON.stringify(await verify(String(email).toLowerCase()))); }
    catch { res.writeHead(400).end(JSON.stringify({ error: "invalid_request" })); }
  });
}).listen(port, "0.0.0.0");
