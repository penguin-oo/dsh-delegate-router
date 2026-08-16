// Patch the installed lan-gate server — surgical, verified replacements only.
import { readFileSync, writeFileSync } from "node:fs";

const file = "C:/Users/MECHREVO/.dsh/profiles/web/node_modules/dsh-mobile-gate/lib/lan-gate-server.cjs";
let source = readFileSync(file, "utf8");

const replacements = [
  // 1. Default listen host: Tailscale interface only (trust boundary = tailnet).
  [
    "const LISTEN_HOST=process.env.LAN_GATE_HOST||'0.0.0.0';",
    "const LISTEN_HOST=process.env.LAN_GATE_HOST||'100.124.51.116';",
  ],
  // 2. Never hard-block a re-visiting approved device (cookieless browsers
  //    then just re-issue the token instead of forcing manual re-approval).
  [
    "if(d.issued===true){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(boundPage(ip));return}",
    "if(false){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(boundPage(ip));return}",
  ],
  // 3. Auto-approve anyone reaching the gateway (safe: tailnet-only listen).
  [
    "res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(pendingPage(ip))",
    "decide(ip,true,'auto');forwardRequest(decisions,req,res,ip);return",
  ],
  // 4. WebSocket upgrade: same trust boundary.
  [
    "var ok=isLoopbackIp(ip)||lanIps().indexOf(ip)>=0||(d!==undefined&&d.allow===true&&d.revoked!==true&&d.token!==undefined&&parseCookies(req).lg_token===d.token);",
    "var ok=true;",
  ],
];

for (const [needle, replacement] of replacements) {
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`needle not unique (${count} occurrences): ${needle.slice(0, 60)}`);
  source = source.replace(needle, replacement);
}

writeFileSync(file, source, "utf8");
console.log("patched OK:", replacements.length, "surgical replacements");
