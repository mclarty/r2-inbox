// Headless UI check: CHROME_PATH=/path/to/chrome node scripts/first-tap-repro.mjs new  (needs playwright-core)
import http from "node:http";
import { chromium } from "playwright-core";
const which = process.argv[2];
const { PAGE } = await import(which === "old" ? process.argv[3] : "../src/page.js");
const msgs = ["a","b","c"].map((n,i)=>({ key:`inbound/2026/10/26/20261026T10000${i}000Z-${n}.eml`, subject:"Subj "+n.toUpperCase(), from_name:"S"+n, from_email:n+"@x.com", received:"2026-10-26T10:00:0"+i+"Z", snippet:"hi" }));
const srv = http.createServer((q,r)=>{ const u=new URL(q.url,"http://x");
  if(u.pathname==="/") {r.setHeader("content-type","text/html");return r.end(PAGE);}
  if(u.pathname==="/api/messages") return r.end(JSON.stringify({messages:msgs,total:3,matched:3}));
  if(u.pathname==="/api/message"){const m=msgs.find(m=>m.key===u.searchParams.get("key"));return r.end(JSON.stringify({...m,has_html:true,headers:[],size:100}));}
  if(u.pathname==="/body"){r.setHeader("content-type","text/html");return r.end("<body style='margin:0'><a href='#'>link</a><input id=i><div style='height:2000px'>Body text</div></body>");}
  r.statusCode=404;r.end();}).listen(0);
const url=`http://127.0.0.1:${srv.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || "/usr/bin/google-chrome",args:["--no-sandbox"]});
async function run(touch, via, focusFrame){
  const ctx=await browser.newContext({viewport:{width:390,height:800},hasTouch:touch,isMobile:touch});
  const page=await ctx.newPage(); await page.goto(url); await page.waitForSelector(".row");
  const act=(sel)=>touch?page.tap(sel):page.click(sel);
  await act(".row >> nth=0"); await page.waitForFunction(()=>document.getElementById("subject").textContent==="Subj A");
  await page.waitForTimeout(300);
  if(focusFrame){ const f=page.frameLocator("iframe"); if(touch) await f.locator("#i").tap(); else await f.locator("#i").click(); }
  if(via==="back") await act("#back");
  else { const c=await page.$("#when"); const b=await c.boundingBox(); const y=b.y+b.height/2;
    await page.evaluate(([y])=>{const el=document.getElementById("when");const mk=(t,x)=>{const tp=new Touch({identifier:1,target:el,clientX:x,clientY:y});el.dispatchEvent(new TouchEvent(t,{bubbles:true,touches:t==="touchend"?[]:[tp],changedTouches:[tp]}));};mk("touchstart",20);mk("touchend",220);},[y]); }
  await page.waitForFunction(()=>!document.getElementById("app").classList.contains("reading-open"));
  await page.waitForTimeout(200);
  await act(".row >> nth=1");
  await page.waitForTimeout(500);
  const ok=await page.evaluate(()=>document.getElementById("app").classList.contains("reading-open")&&document.getElementById("subject").textContent==="Subj B");
  await ctx.close(); return ok;
}
for(const touch of [false,true]) for(const via of ["back","swipe"]) for(const ff of [false,true])
  console.log(which, touch?"touch":"mouse", via, ff?"iframe-focused":"no-frame-focus", (await run(touch,via,ff))?"OPENED on 1st":"LOST 1st");
await browser.close(); srv.close();
