import {defineConfig} from "@playwright/test";
export default defineConfig({testDir:"tests/browser",timeout:45_000,fullyParallel:false,workers:1,use:{baseURL:process.env.RALLY_BASE_URL||"http://127.0.0.1:4173",viewport:{width:1440,height:1050},trace:"retain-on-failure"},
  webServer:process.env.RALLY_BASE_URL?undefined:{command:"npm run dev",url:"http://127.0.0.1:4173",reuseExistingServer:false,timeout:30_000}});
