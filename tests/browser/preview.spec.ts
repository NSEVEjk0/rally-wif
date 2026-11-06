import {test,expect} from "@playwright/test";
import {mkdir,readFile} from "node:fs/promises";
import {toFunctionSelector} from "viem";

test("reservation, direct refund, calendar and repeat stay explicitly fictional",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Sample events · fictional hosts and bookings. No real WIF is used.")).toBeVisible();
  await page.getByRole("button",{name:"View Build a simple website",exact:true}).click();
  await page.getByRole("button",{name:"Try a sample booking",exact:true}).click();
  await expect(page.getByRole("dialog")).toContainText("No wallet signature or WIF payment is needed.");
  await page.getByRole("button",{name:"Confirm sample booking",exact:true}).click();
  await expect(page.getByText("Your sample place is booked. No real payment was made.")).toBeVisible();
  await expect(page.getByText(/Sample balance: 95 WIF/)).toBeVisible();
  await page.getByRole("button",{name:"Move to booking deadline",exact:true}).click();
  await expect(page.getByText("5 WIF ready to refund",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Try a sample refund",exact:true}).click();
  await expect(page.getByText(/Sample balance: 100 WIF/)).toBeVisible();
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:"Add to calendar",exact:false}).click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  await page.getByRole("button",{name:"Try managing this sample event",exact:true}).click();
  await page.getByRole("button",{name:"Copy this event for next time",exact:true}).first().click();
  await expect(page.getByLabel("Event title",{exact:true})).toHaveValue("Build a simple website");
  await page.getByRole("button",{name:"Review event details and deposit",exact:false}).click();
  await expect(page.getByRole("dialog")).toContainText("12.5 WIF");
  await page.getByRole("button",{name:"Save sample event",exact:true}).click();
  await expect(page.getByText(/Sample balance: 87.5 WIF/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("missed check-in exposes reservation plus the correct bond share",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"View Get feedback on your project",exact:true}).click();
  await page.getByRole("button",{name:"Try a sample booking",exact:true}).click();
  await page.getByRole("button",{name:"Confirm sample booking",exact:true}).click();
  await page.getByRole("button",{name:"Show missed host check-in",exact:true}).click();
  await expect(page.getByText("11 WIF ready to refund",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Try a sample refund",exact:true}).click();
  await expect(page.getByText(/Sample balance: 103 WIF/)).toBeVisible();
});

test("desktop and mobile show fixed terms and an empty configured live contract without fictional sessions",async({page})=>{
  // Disclosed read-only RPC fixture. This test never submits a mainnet transaction.
  const deployment=JSON.parse(await readFile("src/deployment.json","utf8"));
  const review=JSON.parse(await readFile("src/launch-review.json","utf8"));
  expect(deployment.contract).toBeTruthy();
  const reads:string[]=[];
  await page.route(/^https:\/\/rpc\.mainnet\.chain\.robinhood\.com\/?$/,async route=>{
    const body=route.request().postDataJSON();
    const reply=(request:{id:number;method:string;params:unknown[]})=>{
      reads.push(request.method);
      let result:string;
      if(request.method==="eth_chainId")result="0x1237";
      else if(request.method==="eth_getCode"){
        expect(String(request.params[0]).toLowerCase()).toBe(deployment.contract.toLowerCase());
        result=review.runtimeBytecode;
      }else{
        expect(request.method).toBe("eth_call");
        const call=request.params[0] as {to:string;data:string};
        expect(call.to.toLowerCase()).toBe(deployment.contract.toLowerCase());
        expect(call.data).toBe(toFunctionSelector("nextRoundId()"));
        result="0x"+"1".padStart(64,"0");
      }
      return {jsonrpc:"2.0",id:request.id,result};
    };
    await route.fulfill({json:Array.isArray(body)?body.map(reply):reply(body),headers:{"access-control-allow-origin":"*"}});
  });
  await mkdir("reports",{recursive:true});
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Book a place. Join a small event."})).toBeVisible();
  await page.screenshot({path:"reports/rally-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:"reports/rally-mobile.png",fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole("button",{name:"Live bookings",exact:true}).click();
  await expect(page.getByRole("heading",{name:"No events found."})).toBeVisible();
  await expect(page.getByText("Try another event type or create an event.")).toBeVisible();
  await expect(page.locator(".session-card")).toHaveCount(0);
  expect(reads).toContain("eth_getCode");
  expect(reads).toContain("eth_call");
  await page.getByRole("button",{name:"Connect wallet",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("wallet app");
});
