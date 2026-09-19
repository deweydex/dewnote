import { chromium } from "playwright";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const ROOT = "/home/user/dewlab";
function walk(d,o=[]){for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())walk(p,o);else if(e.name.endsWith(".md"))o.push(p);}return o;}
const files=[...walk(join(ROOT,"tutorials")),...walk(join(ROOT,"pages"))].sort();
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage();
p.on("pageerror", e=>console.error("PAGEERR", e.message.slice(0,140)));
await p.goto("file:///home/user/dewnote/dist/index.html");
const fences = s => [...s.matchAll(/^```(.*)$/gm)].map(m=>m[1]).filter((_,i)=>i%2===0);
const ids = s => [...s.matchAll(/^id:\s*(\S+)/gm)].map(m=>m[1]);
const heads = s => [...s.matchAll(/^(#{1,6})\s+(.*)$/gm)].map(m=>m[0]);
const folds = s => (s.match(/<details/g)||[]).length;
const dollars = s => (s.match(/\$\$/g)||[]).length;
let identical=0, idem=0, structural=0, bad=[];
for (const f of files) {
  const src = readFileSync(f,"utf8");
  const [o1,o2] = await p.evaluate(async (md)=>{const a=globalThis.__dewnote;await a.open(md);const x=a.markdown();await a.open(x);return [x,a.markdown()];}, src);
  if (o1===src) identical++;
  if (o2===o1) idem++;
  const ok = fences(o1).join("|")===fences(src).join("|") && ids(o1).join("|")===ids(src).join("|")
          && heads(o1).join("|")===heads(src).join("|") && folds(o1)===folds(src) && dollars(o1)===dollars(src);
  if (ok) structural++; else bad.push(f.slice(ROOT.length+1));
}
await b.close();
console.log(`files=${files.length}  byte-identical=${identical}  idempotent=${idem}  structure-preserved=${structural}`);
if (bad.length) console.log("structure lost in:", bad.join("\n  "));
