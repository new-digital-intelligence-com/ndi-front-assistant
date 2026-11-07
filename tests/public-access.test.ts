import {test} from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {proxy} from "../src/proxy";
import {conversationGate} from "../src/lib/publicConversation";

test("public demo pages are accessible while account mutations stay authenticated", async()=>{
 process.env.SITE_PASSWORD="synthetic-test-password";
 for(const path of ["/","/voice","/avatar","/aida","/docs"]){
  const result=await proxy(new NextRequest("https://clara.test"+path));
  assert.equal(result.headers.get("x-middleware-next"),"1");
 }
 const account=await proxy(new NextRequest("https://clara.test/api/account",{method:"POST"}));
 assert.equal(account.status,401);
});
test("public conversation starts reject cross-site requests and bound repeated starts",()=>{
 let now=1000;const gate=conversationGate(()=>now);
 const req=(ip="192.0.2.1",origin="https://clara.test")=>new Request("https://clara.test/api/elevenlabs/signed-url",{headers:{"x-forwarded-for":ip,origin}});
 assert.equal(gate(req("192.0.2.1","https://outside.test"))?.status,403);
 for(let i=0;i<10;i++)assert.equal(gate(req()),null);
 assert.equal(gate(req())?.status,429);
 assert.equal(gate(req("192.0.2.2")),null);
 now+=600001;assert.equal(gate(req()),null);
});
