import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {chromium, expect} from '@playwright/test';
import {createPublicClient, http, keccak256, decodeEventLog, decodeFunctionData, formatEther, erc20Abi} from 'viem';

// A read-only live browser check and recording. No wallet/provider is injected,
// no RPC responses are mocked, and this script cannot sign or send transactions.
const root=resolve(import.meta.dirname,'..');
const deployment=JSON.parse(await readFile(resolve(root,'src/deployment.json'),'utf8'));
const evidence=JSON.parse(await readFile(resolve(root,'docs/mainnet-demo.json'),'utf8'));
const abi=JSON.parse(await readFile(resolve(root,'src/abi.json'),'utf8'));
const origin='https://rally-wif.vercel.app';
const rpc='https://rpc.mainnet.chain.robinhood.com';
const explorer='https://robinhoodchain.blockscout.com';
const out=resolve(root,'reports/submission');
const publicOut=resolve(root,'public/demo');
assert.equal(evidence.chainId,deployment.chainId);
assert.equal(evidence.contract.toLowerCase(),deployment.contract.toLowerCase());
assert.equal(evidence.token.toLowerCase(),deployment.token.toLowerCase());
assert.match(evidence.disclosure,/controlled/i);

let ffmpeg=process.env.FFMPEG_BIN;
if(!ffmpeg){
  const located=spawnSync('python3',['-c','import shutil; print(shutil.which("ffmpeg") or __import__("imageio_ffmpeg").get_ffmpeg_exe())'],{encoding:'utf8',timeout:5000});
  if(located.status!==0)throw new Error('An existing FFmpeg/libx264 installation is required. Nothing was recorded or submitted.');
  ffmpeg=located.stdout.trim();
}
const encoders=spawnSync(ffmpeg,['-hide_banner','-encoders'],{encoding:'utf8',timeout:5000});
assert.equal(encoders.status,0,'FFmpeg must be available before recording');
assert.match(encoders.stdout,/libx264/);
await mkdir(out,{recursive:true,mode:0o700});

const client=createPublicClient({transport:http(rpc,{timeout:20_000,retryCount:0})});
const [chainId,code,latest,round1,round2,balance,liability,hostCredit,participantCredit]=await Promise.all([
  client.getChainId(),client.getCode({address:deployment.contract}),client.getBlockNumber(),
  client.readContract({address:deployment.contract,abi,functionName:'getRound',args:[1n]}),
  client.readContract({address:deployment.contract,abi,functionName:'getRound',args:[2n]}),
  client.readContract({address:deployment.token,abi:erc20Abi,functionName:'balanceOf',args:[deployment.contract]}),
  client.readContract({address:deployment.contract,abi,functionName:'totalLiability'}),
  client.readContract({address:deployment.contract,abi,functionName:'credits',args:[evidence.controlledWallets.host]}),
  client.readContract({address:deployment.contract,abi,functionName:'credits',args:[evidence.controlledWallets.participant]})
]);
assert.equal(chainId,4663);
assert.equal(keccak256(code),deployment.runtimeCodeHash);
assert.equal(round1.phase,3,'Round 1 must be underfilled');
assert.equal(round1.price,10n**16n);
assert.equal(round1.minimum,2);
assert.equal(round2.parentRound,1n,'Repeat round must link to the original');
assert.equal(round2.phase,4,'Round 2 must be cancelled');
assert.equal(round2.price,10n**16n);
for(const round of [round1,round2])assert.match(JSON.parse(round.metadata).description,/controlled/i);
for(const value of [balance,liability,hostCredit,participantCredit])assert.equal(value,0n,'Demo accounting must be clear');

const verified=[];
for(const label of ['reserve1','refund1','reserve2']){
  const saved=evidence.transactions.find(tx=>tx.label===label);
  assert.ok(saved,'A recorded transaction is required');
  const [receipt,transaction]=await Promise.all([
    client.getTransactionReceipt({hash:saved.transactionHash}),
    client.getTransaction({hash:saved.transactionHash})
  ]);
  const block=await client.getBlock({blockNumber:receipt.blockNumber});
  assert.equal(receipt.status,'success');
  assert.equal(receipt.blockHash,saved.blockHash);
  assert.equal(receipt.blockNumber.toString(),saved.blockNumber);
  assert.equal(block.hash,receipt.blockHash);
  assert.ok(latest>=receipt.blockNumber+1n,'Two confirmations are required');
  assert.equal(receipt.from.toLowerCase(),evidence.controlledWallets.participant.toLowerCase());
  assert.equal(receipt.to.toLowerCase(),deployment.contract.toLowerCase());
  const input=decodeFunctionData({abi,data:transaction.input});
  assert.equal(input.functionName,label==='refund1'?'refund':'reserve');
  assert.equal(input.args[0],label==='reserve2'?2n:1n);
  const events=receipt.logs.filter(log=>log.address.toLowerCase()===deployment.contract.toLowerCase()).map(log=>decodeEventLog({abi,data:log.data,topics:log.topics}));
  const event=events.find(event=>event.eventName===(label==='refund1'?'Refunded':'SeatReserved'));
  assert.ok(event,'Expected settled contract event is required');
  assert.equal(event.args.participant.toLowerCase(),evidence.controlledWallets.participant.toLowerCase());
  assert.equal(event.args.id,label==='reserve2'?2n:1n);
  assert.equal(label==='refund1'?event.args.amount:event.args.paid,10n**16n);
  if(label==='refund1')assert.ok(events.some(event=>event.eventName==='RoundUnderfilled'));
  verified.push({label,hash:receipt.transactionHash,block:receipt.blockNumber.toString(),from:receipt.from,to:receipt.to,function:`${input.functionName}(${input.args[0]})`,event:event.eventName,amountWIF:'0.01'});
}

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:out,size:{width:1440,height:1000}}});
const page=await context.newPage(),video=page.video(),started=Date.now(),segments=[],pageErrors=[];
page.on('pageerror',error=>pageErrors.push(error.message));
const time=()=>((Date.now()-started)/1000).toFixed(3);
const disclosure='Controlled-wallet mainnet demo · No independent customers or workshop attendance claimed';

async function scene(caption,action,seconds){
  if(action)await action();
  await page.evaluate(({caption,disclosure})=>{
    let bar=document.getElementById('recording-disclosure');
    if(!bar){bar=document.createElement('div');bar.id='recording-disclosure';bar.style.cssText='position:fixed;inset:0 0 auto;padding:10px 20px;background:#203b30;color:#fff;font:16px/1.4 system-ui;text-align:center;z-index:100001;pointer-events:none';document.body.append(bar);}
    bar.textContent=disclosure;
    let box=document.getElementById('recording-caption');
    if(!box){box=document.createElement('div');box.id='recording-caption';box.style.cssText='position:fixed;left:5%;right:5%;bottom:20px;padding:18px 24px;background:#203b30;color:white;border-radius:12px;font:23px/1.45 system-ui;z-index:100002;box-shadow:0 5px 30px #0003;pointer-events:none';document.body.append(box);}
    box.textContent=caption;
  },{caption,disclosure});
  const start=time();
  await page.waitForTimeout(350);
  await page.screenshot({path:resolve(out,`rally-scene-${segments.length+1}.png`)});
  await page.waitForTimeout(seconds*1000-350);
  segments.push({caption,start,end:time()});
}

async function openRound(id,title){
  await page.goto(`${origin}/?mode=live&round=${id}`,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible({timeout:60_000});
  await expect(page.locator('.detail-description')).toContainText(/controlled/i);
  await expect(page.locator('.booking-price')).toContainText('0.01');
  assert.equal(await page.evaluate(()=>Boolean(window.ethereum)),false,'Recording must be wallet-free');
}

async function showReceipt(label,title){
  const receipt=verified.find(receipt=>receipt.label===label);
  await page.evaluate(({receipt,title,explorer})=>{
    document.getElementById('receipt-excerpt')?.remove();
    const panel=document.createElement('section');panel.id='receipt-excerpt';
    panel.style.cssText='position:fixed;inset:100px 8% 140px;padding:36px 44px;background:#f9faf2;border:2px solid #203b30;border-radius:18px;z-index:99999;color:#203b30;box-shadow:0 12px 50px #0003;font:22px/1.5 system-ui';
    const tag=document.createElement('p');tag.textContent='ACTUAL MAINNET RECEIPT · READ FROM PUBLIC RPC';tag.style.cssText='font-size:16px;letter-spacing:.06em;margin:0';panel.append(tag);
    const heading=document.createElement('h2');heading.textContent=title;heading.style.cssText='font-size:44px;margin:10px 0 20px';panel.append(heading);
    for(const text of [`Confirmed · Block ${receipt.block} · Chain 4663`,`Contract call: ${receipt.function}`,`${receipt.event} · ${receipt.amountWIF} WIF`,`Participant: ${receipt.from}`,`Rally contract: ${receipt.to}`]){const row=document.createElement('p');row.textContent=text;row.style.cssText='margin:10px 0;font-size:20px;overflow-wrap:anywhere';panel.append(row);}
    const hash=document.createElement('p');hash.textContent=receipt.hash;hash.style.cssText='font:18px/1.5 monospace;padding:14px;background:#e8edda;overflow-wrap:anywhere';panel.append(hash);
    const link=document.createElement('a');link.textContent='Full transaction on Blockscout ↗';link.href=`${explorer}/tx/${receipt.hash}`;link.style.color='#203b30';panel.append(link);
    document.body.append(panel);
  },{receipt,title,explorer});
  await expect(page.locator('#receipt-excerpt a')).toHaveAttribute('href',`${explorer}/tx/${receipt.hash}`);
}

try{
  await page.goto(`${origin}/?mode=live`,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Make a plan. Make it happen.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'View Feedback circle · demo',exact:true})).toBeVisible({timeout:60_000});
  await expect(page.locator('.session-card')).toHaveCount(2);
  await scene('Rally: a small feedback circle, fixed WIF reservations, and a clear minimum to form the group.',null,6);
  await scene('Round 1 fixed a 0.01 WIF price, minimum of two, and a 0.01 WIF host bond. These were real mainnet terms.',()=>openRound(1,'Feedback circle · demo'),7);
  await scene('This controlled participant reserved with real WIF. The displayed receipt was independently rechecked on the public chain.',()=>showReceipt('reserve1','Reserved 0.01 WIF'),8);
  await scene('Only one reservation joined. After the genuine cutoff, the participant directly recovered the full 0.01 WIF.',()=>showReceipt('refund1','Full underfilled refund: 0.01 WIF'),9);
  await scene('The host created round 2 with fresh terms linked to round 1. Repeating creates a new commitment.',()=>openRound(2,'Feedback circle repeat · demo'),7);
  await scene('The same controlled participant made a fresh 0.01 WIF reservation, then left before cutoff for a full refund.',()=>showReceipt('reserve2','A fresh repeat reservation: 0.01 WIF'),8);
  await scene('Both host bonds were returned. Completion and missed-check-in passed contract/fork tests; this demo makes no attendance claim.',async()=>{
    await page.evaluate(({contract,sourceCommit})=>{
      const panel=document.getElementById('receipt-excerpt');panel.replaceChildren();
      const heading=document.createElement('h2');heading.textContent='Real WIF proof. Clear limits.';heading.style.cssText='font-size:42px;margin:0 0 24px';panel.append(heading);
      for(const text of ['Contract WIF balance: 0','Remaining contract liability: 0','Host and participant credits: 0','Recorded: reservation → full refund → fresh repeat reservation','Controlled demo wallets; customer demand and attendance untested']){const p=document.createElement('p');p.textContent=text;p.style.cssText='margin:14px 0;font-size:22px';panel.append(p);}
      const link=document.createElement('a');link.textContent='github.com/NSEVEjk0/rally-wif';link.href=`https://github.com/NSEVEjk0/rally-wif/tree/${sourceCommit}`;link.style.cssText='display:block;margin-top:24px;color:#203b30';panel.append(link);
      const address=document.createElement('p');address.textContent=`Chain 4663 · ${contract}`;address.style.cssText='font:17px/1.5 monospace;overflow-wrap:anywhere';panel.append(address);
    },{contract:deployment.contract,sourceCommit:evidence.sourceCommit});
  },7);
  assert.deepEqual(pageErrors,[],'The live app must have no browser errors');
  await page.locator('#receipt-excerpt').evaluate(element=>element.remove());
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Live session must fit a mobile viewport');
}finally{await context.close();await browser.close();}

const raw=await video.path();
const filters=segments.map((segment,index)=>`[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[v${index}]`).join(';')+';'+segments.map((_,index)=>`[v${index}]`).join('')+`concat=n=${segments.length}:v=1:a=0[out]`;
const destination=resolve(out,'rally-mainnet.mp4');
const encoded=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',raw,'-filter_complex',filters,'-map','[out]','-t','55','-r','24','-c:v','libx264','-preset','fast','-threads','2','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart',destination],{encoding:'utf8',timeout:120_000});
assert.equal(encoded.status,0,`MP4 encoding failed: ${encoded.stderr?.slice(-500)}`);
const metadata=spawnSync(ffmpeg,['-hide_banner','-i',destination],{encoding:'utf8',timeout:10_000});
const duration=/Duration: (\d+):(\d+):(\d+\.\d+)/.exec(metadata.stderr);
assert.ok(duration,'The encoded video duration must be readable');
const seconds=Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3]);
assert.ok(seconds>45&&seconds<=55,'The video must be between 45 and 55 seconds');
const bytes=await readFile(destination);
const sha256=createHash('sha256').update(bytes).digest('hex');
const record={schema:'rally-recording-v1',origin,disclosure,sourceCommit:evidence.sourceCommit,recordedAt:new Date().toISOString(),video:'/demo/rally-mainnet.mp4',durationSeconds:seconds,sha256,editedIdleWaiting:true,transactionsSent:0,mockedResponses:0,verifiedRuntimeCodeHash:deployment.runtimeCodeHash,verifiedReceipts:verified,accounting:{contractWIF:formatEther(balance),totalLiabilityWIF:formatEther(liability),hostCreditWIF:formatEther(hostCredit),participantCreditWIF:formatEther(participantCredit)}};
await mkdir(publicOut,{recursive:true});
await copyFile(destination,resolve(publicOut,'rally-mainnet.mp4'));
await copyFile(resolve(root,'docs/mainnet-demo.json'),resolve(publicOut,'mainnet-demo.json'));
await writeFile(resolve(publicOut,'recording.json'),JSON.stringify(record,null,2)+'\n');
await writeFile(resolve(out,'recording.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({liveBrowserPassed:true,video:destination,durationSeconds:seconds,sha256,transactionsSent:0,mockedResponses:0}));
