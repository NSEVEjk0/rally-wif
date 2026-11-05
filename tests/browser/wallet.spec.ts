import {test,expect,type Browser,type Page} from "@playwright/test";
import {readFile,mkdir,writeFile} from "node:fs/promises";
test.skip(process.env.RALLY_LOCAL_CHAIN!=="true","Requires the isolated mock-token chain.");
const rpc="http://127.0.0.1:8545";
let counter=0;
async function call(method:string,params:unknown[]=[]){const r=await fetch(rpc,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:++counter,method,params})});const data=await r.json();if(data.error)throw new Error(JSON.stringify(data.error));return data.result;}
async function walletPage(browser:Browser,address:string){
  const context=await browser.newContext({timezoneId:"UTC"});
  await context.addInitScript(({address,rpc})=>{
    (window as unknown as {ethereum:unknown}).ethereum={request:async({method,params=[]}:{method:string;params?:unknown[]})=>{
      if(method==="eth_requestAccounts"||method==="eth_accounts")return [address];
      if(method==="wallet_switchEthereumChain"||method==="wallet_addEthereumChain")return null;
      const response=await fetch(rpc,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
      const data=await response.json();if(data.error)throw new Error(data.error.message);return data.result;
    }};
  },{address,rpc});
  const page=await context.newPage();
  await page.route("https://rpc.mainnet.chain.robinhood.com",async route=>{const result=await route.fetch({url:rpc});await route.fulfill({response:result});});
  await page.clock.install({time:new Date()});return page;
}
async function jump(page:Page,seconds:number){await call("evm_setNextBlockTimestamp",[seconds]);await call("evm_mine");await page.clock.setSystemTime(new Date(seconds*1000));}
async function open(page:Page,id=1){await page.goto(`/?mode=live&round=${id}`);await page.getByRole("button",{name:"Connect wallet",exact:true}).click();}
const inputDate=(n:number)=>new Date(n*1000).toISOString().slice(0,16);

test("wallet approves exact amounts, books, leaves and refunds without host intervention",async({browser})=>{
  test.setTimeout(180_000);
  const accounts=JSON.parse(await readFile(".local/test-accounts.json","utf8"));
  const host=await walletPage(browser,accounts[0]);
  const latest=await call("eth_getBlockByNumber",["latest",false]);const at=Number(BigInt(latest.timestamp));
  const deadline=Math.ceil((at+900)/60)*60,start=deadline+3600,end=start+3600;
  await host.goto("/?mode=live");await host.getByRole("button",{name:"Connect wallet",exact:true}).click();
  await host.locator("header").getByRole("button",{name:"Host a session",exact:true}).click();
  await host.getByLabel("Session title",{exact:true}).fill("Isolated wallet-test workshop");
  await host.getByLabel("Minimum to form the group",{exact:true}).fill("2");
  await host.getByLabel("Booking cutoff",{exact:true}).fill(inputDate(deadline));
  await host.getByLabel("Session starts",{exact:true}).fill(inputDate(start));
  await host.getByLabel("Session ends",{exact:true}).fill(inputDate(end));
  await host.getByRole("button",{name:"Review the fixed terms",exact:false}).click();
  await expect(host.getByRole("dialog")).toContainText("5 WIF");
  await host.getByRole("button",{name:"Approve bond & publish",exact:false}).click();
  await expect(host.getByRole("heading",{name:"Isolated wallet-test workshop",exact:true})).toBeVisible({timeout:60_000});
  const alice=await walletPage(browser,accounts[1]);await open(alice);
  await alice.getByRole("button",{name:"Reserve with WIF",exact:false}).click();
  await alice.getByRole("button",{name:"Confirm WIF reservation",exact:false}).click();
  await expect(alice.getByText("You have a reservation.",{exact:true})).toBeVisible({timeout:60_000});
  await expect(alice.getByText("995 WIF in your connected wallet",{exact:true})).toBeVisible();
  await alice.getByRole("button",{name:"Leave & get full refund",exact:true}).click();
  await expect(alice.getByText("1000 WIF in your connected wallet",{exact:true})).toBeVisible({timeout:60_000});
  await alice.getByRole("button",{name:"Reserve with WIF",exact:false}).click();
  await alice.getByRole("button",{name:"Confirm WIF reservation",exact:false}).click();
  await expect(alice.getByText("You have a reservation.",{exact:true})).toBeVisible({timeout:60_000});
  await jump(alice,deadline+1);await alice.reload();await alice.clock.setSystemTime(new Date((deadline+1)*1000));
  await alice.getByRole("button",{name:"Connect wallet",exact:true}).click();
  await expect(alice.getByText("5 WIF available",{exact:true})).toBeVisible();
  await alice.getByRole("button",{name:"Claim refund",exact:false}).click();
  await expect(alice.getByText("1000 WIF in your connected wallet",{exact:true})).toBeVisible({timeout:60_000});
  await host.reload();await host.clock.setSystemTime(new Date((deadline+1)*1000));await host.getByRole("button",{name:"Connect wallet",exact:true}).click();
  await host.getByRole("button",{name:"Claim 5 WIF host credit",exact:false}).click();
  await expect(host.getByText("1000 WIF in your connected wallet",{exact:true})).toBeVisible({timeout:60_000});
  await mkdir("reports",{recursive:true});
  await writeFile("reports/wallet-test.json",JSON.stringify({environment:"Isolated chain with mock WIF, no mainnet transactions",paths:["creator bond","exact allowance","reserve","leave","reserve again","permissionless underfilled refund","host bond claim"],chainId:4663}));
  await host.context().close();await alice.context().close();
});
