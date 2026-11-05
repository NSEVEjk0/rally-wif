import {test,expect} from "@playwright/test";
import {mkdir} from "node:fs/promises";

test("reservation, direct refund, calendar and repeat stay explicitly fictional",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Example sessions · fictional people and reservations. No WIF is moved.")).toBeVisible();
  await page.getByRole("button",{name:"View Build night: from idea to onchain",exact:true}).click();
  await page.getByRole("button",{name:"Try a reservation",exact:true}).click();
  await expect(page.getByRole("dialog")).toContainText("No wallet signature or WIF transfer occurs.");
  await page.getByRole("button",{name:"Confirm preview reservation",exact:true}).click();
  await expect(page.getByText("You have a preview reservation.")).toBeVisible();
  await expect(page.getByText(/Preview balance: 95 WIF/)).toBeVisible();
  await page.getByRole("button",{name:"Move to booking cutoff",exact:true}).click();
  await expect(page.getByText("5 WIF available",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Try claiming the refund",exact:true}).click();
  await expect(page.getByText(/Preview balance: 100 WIF/)).toBeVisible();
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:"Add to calendar",exact:false}).click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  await page.getByRole("button",{name:"Try the host view",exact:true}).click();
  await page.getByRole("button",{name:"Plan the next session",exact:true}).first().click();
  await expect(page.getByLabel("Session title",{exact:true})).toHaveValue("Build night: from idea to onchain");
  await page.getByRole("button",{name:"Review the fixed terms",exact:false}).click();
  await expect(page.getByRole("dialog")).toContainText("12.5 WIF");
  await page.getByRole("button",{name:"Publish the example",exact:true}).click();
  await expect(page.getByText(/Preview balance: 87.5 WIF/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("missed check-in exposes reservation plus the correct bond share",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"View Your next launch, better together",exact:true}).click();
  await page.getByRole("button",{name:"Try a reservation",exact:true}).click();
  await page.getByRole("button",{name:"Confirm preview reservation",exact:true}).click();
  await page.getByRole("button",{name:"Show missed host check-in",exact:true}).click();
  await expect(page.getByText("11 WIF available",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Try claiming the refund",exact:true}).click();
  await expect(page.getByText(/Preview balance: 103 WIF/)).toBeVisible();
});

test("desktop and mobile show real terms and make pending live access explicit",async({page})=>{
  await mkdir("reports",{recursive:true});
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Make a plan. Make it happen."})).toBeVisible();
  await page.screenshot({path:"reports/rally-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:"reports/rally-mobile.png",fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole("button",{name:"Live sessions",exact:true}).click();
  await expect(page.getByRole("heading",{name:"The live booking contract is next."})).toBeVisible();
  await page.getByRole("button",{name:"Connect wallet",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("wallet browser");
});
