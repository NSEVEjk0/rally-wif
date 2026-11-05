import "./style.css";
import {formatWif,parseWif,bondFor,effectivePhase,refundable,checkInAvailable,completionAmounts,defaultDraft,draftTerms,repeatDraft,calendar,CHECKIN_GRACE,type Session,type Draft,type Terms} from "./domain.ts";
import * as chain from "./chain.ts";
import {examples} from "./examples.ts";
import type {Address,Hash} from "viem";

const root=document.querySelector<HTMLDivElement>("#app")!;
const initialNow=Math.floor(Date.now()/1000);
let exampleNow=initialNow,exampleSessions=examples(initialNow),liveSessions:Session[]=[];
let mode:"examples"|"live"="examples",view:"browse"|"host"|"session"="browse",selectedId=1n;
let loading=false,busy=false,error="",status="",receipt:{hash:Hash;block:bigint}|undefined;
let demoBalance=parseWif("100"),liveBalance=0n,credit=0n;
let reserved=new Set<string>(),demoReservations=new Set<string>();
let draft=loadDraft(),review:{kind:"create";terms:Terms}|{kind:"reserve";session:Session}|undefined;
let filter="All sessions";
const esc=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const short=(value:string)=>value.length>16?value.slice(0,6)+"…"+value.slice(-4):value;
const now=()=>mode==="examples"?exampleNow:Math.floor(Date.now()/1000);
const collection=()=>mode==="examples"?exampleSessions:liveSessions;
const current=()=>collection().find(s=>s.id===selectedId);
const date=(seconds:number)=>new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(seconds*1000));
const day=(seconds:number)=>new Intl.DateTimeFormat(undefined,{day:"2-digit"}).format(new Date(seconds*1000));
const month=(seconds:number)=>new Intl.DateTimeFormat(undefined,{month:"short"}).format(new Date(seconds*1000));
const isReserved=(s:Session)=>(s.example?demoReservations:reserved).has(s.id.toString());
const isHost=(s:Session)=>s.example?s.creator==="you-example":Boolean(chain.account()&&chain.account()!.toLowerCase()===s.creator.toLowerCase());
const arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
const check='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>';
function loadDraft():Draft {try{const d=JSON.parse(localStorage.getItem("rally-draft")||"null");if(d&&typeof d.title==="string")return {...defaultDraft(initialNow),...d};}catch{}return defaultDraft(initialNow);}
function saveDraft(){try{localStorage.setItem("rally-draft",JSON.stringify(draft));}catch{}}
function toast(message:string){document.querySelector("#toast")!.textContent=message;setTimeout(()=>{document.querySelector("#toast")!.textContent="";},4500);}
function download(name:string,text:string,type="application/json"){
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function phaseText(s:Session){const p=effectivePhase(s,now());return {funding:s.seats>=s.minimum?"Minimum reached":"Gathering the group",confirmed:"Group confirmed",completed:"Session completed",underfilled:"Full refund available",cancelled:"Session cancelled",missed:"Host missed check-in"}[p];}
function header(){return `<header><a class="brand" href="/" data-act="home"><span class="logo">r</span>Rally<span class="brand-dot">.</span></a><nav aria-label="Main navigation"><a href="#how-it-works" data-act="how">How it works</a><button class="text-button" data-act="host">Host a session</button></nav><div class="wallet"><span class="network"><i></i>WIF · Robinhood Chain</span><button class="button small ${chain.account()?"subtle":"dark"}" data-act="connect">${chain.account()?esc(short(chain.account()!)):"Connect wallet"}</button></div></header>`;}
function modebar(){return `<div class="modebar"><div><span class="example-dot"></span>${mode==="examples"?"Example sessions · fictional people and reservations. No WIF is moved.":"Live WIF sessions · fixed terms on Robinhood Chain."}</div><div class="segmented" aria-label="Session mode"><button data-act="examples" aria-pressed="${mode==="examples"}">Explore examples</button><button data-act="live" aria-pressed="${mode==="live"}">Live sessions</button></div></div>`;}
function hero(){return `<section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="tiny-star">✳</span> Community plans. Real commitments.</p><h1>Make a plan.<br><span>Make it happen.</span></h1><p class="lede">A workshop. A feedback circle. A reason to get together.<br>Rally brings the group together with refundable WIF reservations and a commitment from the host.</p><div class="hero-actions"><button class="button dark" data-act="browse">Find your next session ${arrow}</button><button class="button outline" data-act="host">Bring people together</button></div><p class="hero-note">Your WIF stays in the booking contract until the session’s conditions are met.</p></div><div class="hero-art" aria-label="A group forming around a community session"><div class="art-note">A little commitment<br>goes a long way. <span>↘</span></div><div class="session-paper"><span class="paper-top">RALLY / THE NEXT ONE</span><div class="paper-date">${month(initialNow+3*86400)}<strong>${day(initialNow+3*86400)}</strong></div><h2>Good people.<br>Something worth<br>showing up for.</h2><div class="paper-bottom"><span>Save a place.<br>Build it together.</span><span class="sunburst">✳</span></div></div><span class="orbit o1">✳</span><span class="orbit o2">+</span><span class="orbit o3">↗</span><span class="paper-sticker">WIF<br><strong>inside</strong></span></div></section>`;}
function card(s:Session,index:number){const p=effectivePhase(s,now()),progress=Math.min(100,Math.round(s.seats/s.minimum*100));return `<article class="session-card"><button class="card-art art-${index%3}" data-act="open" data-id="${s.id}" aria-label="View ${esc(s.metadata.title)}"><span class="category">${esc(s.metadata.category)}</span><span class="art-symbol">${["✳","↗","☕"][index%3]}</span><span class="date-ticket">${esc(month(s.startAt))}<strong>${esc(day(s.startAt))}</strong></span>${s.example?'<span class="fictional">Example</span>':""}</button><div class="card-body"><p class="session-format">${s.metadata.format==="online"?"↗ Online":"⌖ In person"} · ${esc(date(s.startAt))}</p><h3><button data-act="open" data-id="${s.id}">${esc(s.metadata.title)}</button></h3><p class="host-line">${s.example?"A fictional community host":`Host ${esc(short(s.creator))}`}</p><div class="seat-progress" role="img" aria-label="${s.seats} of ${s.minimum} minimum reservations"><span style="width:${progress}%"></span></div><div class="seat-line"><span>${s.seats} / ${s.minimum} to form the group</span><span>${s.capacity} places max</span></div><div class="card-bottom"><span class="price">${formatWif(s.price)} <small>WIF / place</small></span><button class="round-button" data-act="open" data-id="${s.id}" aria-label="View session">${arrow}</button></div><span class="phase ${p}">${check}${esc(phaseText(s))}</span></div></article>`;}
function how(){return `<section id="how-it-works" class="how"><div><p class="eyebrow">From “we should” to “see you there”</p><h2>A group worth<br>showing up for.</h2><p>Hosts set the plan. Everyone can see the terms. WIF makes the commitment count.</p></div><article><span class="step">01</span><h3>A plan with a minimum.</h3><p>The host sets a price, group size and booking cutoff, and puts down a bond.</p></article><article><span class="step">02</span><h3>A place with your name on it.</h3><p>Reserve with WIF. You can leave for a full refund before the booking cutoff.</p></article><article><span class="step">03</span><h3>A clear next step.</h3><p>If the group forms, the host checks in and is paid after the session ends. If it falls short, claim your WIF back.</p></article></section>`;}
function browse(){const list=collection().filter(s=>filter==="All sessions"||s.metadata.category===filter);return `${hero()}<section id="sessions" class="sessions"><div class="section-heading"><div><p class="eyebrow">Find your people</p><h2>Something to look forward to.</h2></div><p>${mode==="examples"?"Try a booking. See the refund path.":"The latest fixed-term WIF sessions."}</p></div><div class="filters" aria-label="Session categories">${["All sessions","Workshop","Feedback circle","Meetup"].map(f=>`<button class="${filter===f?"active":""}" data-act="filter" data-filter="${f}">${f}</button>`).join("")}<button class="text-button refresh" data-act="refresh">↻ Refresh</button></div>${loading?'<div class="empty">Reading the session contract…</div>':list.length?`<div class="session-grid">${list.map(card).join("")}</div>`:`<div class="empty"><span>✳</span><h3>${chain.deployed()?"Be the first to bring your group together.":"The live booking contract is next."}</h3><p>${chain.deployed()?"No matching sessions are listed yet. Publish the first one with your community.":"The tested app is ready for the operator’s funded WIF wallet. Explore the example flow while the mainnet contract is being connected."}</p><button class="button dark" data-act="${chain.deployed()?"host":"examples"}">${chain.deployed()?"Host a session":"Explore examples"}${arrow}</button></div>`}</section>${how()}<section class="host-cta"><span class="cta-star">✳</span><div><p class="eyebrow">You already have a community.</p><h2>Give them a reason to rally.</h2><p>Start small. Make one session happen. Run the next one with a click.</p></div><button class="button lime" data-act="host">Host your first session ${arrow}</button></section>`;}
function sessionPage(s:Session){
  const p=effectivePhase(s,now()),has=isReserved(s),host=isHost(s),amount=refundable(s,has,now());
  const canBook=p==="funding"&&s.seats<s.capacity&&!has&&!host;
  const minimumPayout=completionAmounts(s.price,s.minimum,s.bond);
  return `<section class="session-detail"><button class="back" data-act="home">← All sessions</button><div class="detail-grid"><div><div class="detail-art art-${Number(s.id)%3}"><span class="category">${esc(s.metadata.category)}</span><span class="art-symbol">✳</span><span class="date-ticket">${month(s.startAt)}<strong>${day(s.startAt)}</strong></span>${s.example?'<span class="fictional">Fictional example</span>':""}</div><p class="eyebrow detail-eyebrow">${esc(s.metadata.format)} · ${esc(date(s.startAt))}</p><h1>${esc(s.metadata.title)}</h1><p class="detail-description">${esc(s.metadata.description)}</p><div class="detail-facts"><div><span>Where</span><strong>${esc(s.metadata.location||s.metadata.format)}</strong></div><div><span>Booking cutoff</span><strong>${esc(date(s.deadline))}</strong></div><div><span>Session ends</span><strong>${esc(date(s.endAt))}</strong></div><div><span>Community host</span><strong>${s.example?"Fictional example host":esc(short(s.creator))}</strong></div></div>${s.metadata.website?`<a class="source-link" href="${esc(s.metadata.website)}" rel="noopener noreferrer" target="_blank">Public session page ↗</a>`:""}<div class="detail-tools"><button class="button outline" data-act="calendar">Add to calendar ↗</button><button class="button outline" data-act="share">Copy session link</button>${host?'<button class="button outline" data-act="repeat">Plan the next session</button>':""}</div><div class="terms"><h2>Know what you’re committing to.</h2><div>${check}<p><strong>Leave before the cutoff.</strong> Release your place and get the full ${formatWif(s.price)} WIF back.</p></div><div>${check}<p><strong>${s.minimum} reservations to form the group.</strong> If it falls short, claim your full reservation directly from the contract.</p></div><div>${check}<p><strong>A ${formatWif(s.bond)} WIF host bond.</strong> If the host cancels a confirmed session or misses check-in, the bond is divided among reserved places.</p></div><div>${check}<p><strong>Payment after the session.</strong> Once the recorded check-in and end time conditions are met, the host can claim their payment. A 1% completed-booking fee goes to the WIF sink address.</p></div><p class="terms-note">Host check-in records an onchain action. It does not independently verify attendance or the quality of the session. Refunds require a wallet transaction. One reservation per wallet.</p></div>${!s.example?`<details class="contract-details"><summary>View the fixed onchain terms</summary><dl><dt>Terms fingerprint</dt><dd>${esc(s.termsHash)}</dd><dt>Contract</dt><dd><a href="${chain.explorer}/address/${chain.contractAddress()}" target="_blank" rel="noopener noreferrer">${chain.contractAddress()} ↗</a></dd><dt>Minimum-volume host payout + bond</dt><dd>${formatWif(minimumPayout.creator)} WIF</dd></dl></details>`:""}</div><aside class="booking-panel"><span class="phase ${p}">${check}${phaseText(s)}</span><p class="booking-price">${formatWif(s.price)}<span> WIF</span></p><p class="per-place">for one place in the group</p><div class="seat-progress"><span style="width:${Math.min(100,s.seats/s.minimum*100)}%"></span></div><div class="seat-line"><span>${s.seats} of ${s.minimum} to form</span><span>${Math.max(0,s.capacity-s.seats)} places left</span></div><hr>${has?`<div class="reservation-state">${check} You have a ${s.example?"preview ":""}reservation.</div>`:""}${canBook?`<button class="button dark full" data-act="reserve">${s.example?"Try a reservation":"Reserve with WIF"}${arrow}</button>`:""}${has&&p==="funding"?'<button class="button outline full" data-act="leave">Leave & get full refund</button>':""}${amount>0n?`<div class="refund-callout"><strong>${formatWif(amount)} WIF available</strong><p>${p==="underfilled"?"The group did not reach its minimum.":"Your reservation and applicable host-bond share are ready."}</p><button class="button dark full" data-act="refund">${s.example?"Try claiming the refund":"Claim refund"}${arrow}</button></div>`:""}${host?`<div class="host-controls"><p class="eyebrow">Host controls</p>${checkInAvailable(s,now())?'<button class="button dark full" data-act="checkIn">Check in as host</button>':""}${p==="confirmed"&&s.checkedIn&&now()>=s.endAt?'<button class="button dark full" data-act="complete">Settle the completed session</button>':""}${(p==="funding"||p==="confirmed")?'<button class="button outline full" data-act="cancel">Cancel this session</button>':""}<button class="button outline full" data-act="repeat">Plan the next session</button></div>`:""}<div class="booking-small"><span>Booking cutoff</span><strong>${esc(date(s.deadline))}</strong><span>Host check-in window</span><strong>${esc(date(s.startAt-CHECKIN_GRACE))} – ${esc(date(s.startAt+CHECKIN_GRACE))}</strong></div>${s.example?`<div class="example-controls"><p>Example time & role controls</p><button data-act="cutoff">Move to booking cutoff</button><button data-act="missed">Show missed host check-in</button><button data-act="start">Move to session start</button><button data-act="end">Move to session end</button>${!host?'<button data-act="example-host">Try the host view</button>':""}<span>Preview balance: ${formatWif(demoBalance)} WIF · no real funds</span></div>`:""}</aside></div></section>`;
}
function hostPage(){
  let bond="—";try{bond=formatWif(bondFor(parseWif(draft.price),draft.minimum));}catch{}
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const input=(label:string,name:keyof Draft,type="text",extra="")=>`<label>${label}<input name="${name}" type="${type}" value="${esc(draft[name])}" ${extra}></label>`;
  return `<section class="host-page"><button class="back" data-act="home">← All sessions</button><div class="section-heading"><div><p class="eyebrow">Bring your community together</p><h1>Make the next one happen.</h1></div><span class="draft-badge">Draft stays in this browser</span></div><div class="host-grid"><form id="host-form"><div class="form-card"><h2>What’s the plan?</h2>${input("Session title","title","text",'required maxlength="90" placeholder="A good reason to get together"')}<label>A little more about it<textarea name="description" maxlength="700" rows="4" placeholder="Who is this for? What will you do together?">${esc(draft.description)}</textarea></label><div class="two-cols"><label>Session type<select name="category">${["Workshop","Feedback circle","Meetup"].map(c=>`<option ${draft.category===c?"selected":""}>${c}</option>`).join("")}</select></label><label>Format<select name="format"><option value="online" ${draft.format==="online"?"selected":""}>Online</option><option value="in-person" ${draft.format==="in-person"?"selected":""}>In person</option></select></label></div>${input("Location or meeting instructions","location","text",'maxlength="120" placeholder="Online, or a public meeting place"')}${input("Public session page (optional)","website","url",'maxlength="300" placeholder="https://"')}<p class="field-note">Published details and wallet addresses are public. Keep private meeting links out of the session description.</p></div><div class="form-card"><h2>The commitments</h2><div class="two-cols">${input("WIF per place","price","text",'inputmode="decimal" required')}${input("Minimum to form the group","minimum","number",'min="2" max="100" required')}</div>${input("Maximum places","capacity","number",'min="2" max="100" required')}<p class="field-note">Minimum 2, maximum 100. One reservation per wallet.</p><div class="two-cols">${input("Booking cutoff","deadline","datetime-local","required")}${input("Session starts","startAt","datetime-local","required")}</div>${input("Session ends","endAt","datetime-local","required")}<p class="field-note">Times use ${esc(tz)}. Start at least 30 minutes after the cutoff. Sessions last 15 minutes to 8 hours.</p></div><button type="submit" class="button dark full">Review the fixed terms ${arrow}</button></form><aside class="host-summary"><span class="summary-star">✳</span><h2>A host commitment.<br>A better group.</h2><p>Your bond backs the plan. The group’s reservations stay in the contract until the session’s conditions are met.</p><div class="bond-display"><span>Your creator bond</span><strong><output id="draft-bond">${bond}</output> <small>WIF</small></strong><p>Half the minimum group’s reservation total.</p></div><ul><li>Underfilled group: your bond is returned.</li><li>Completed session: claim revenue and bond after check-in and end time.</li><li>Confirmed cancellation or missed check-in: bond shared among reservations.</li></ul><p class="field-note">A 1% fee applies to completed booking volume. These terms are fixed when published.</p>${draft.parentRound!=="0"?`<p class="repeat-note">A new session following round #${esc(draft.parentRound)}. Previous reservations are not carried over.</p>`:""}</aside></div></section>`;
}
function reviewDialog(){
  if(!review)return "";
  const creating=review.kind==="create",t=review.kind==="create"?review.terms:undefined,s=review.kind==="reserve"?review.session:undefined;
  const amount=t?bondFor(t.price,t.minimum):s!.price;
  return `<div class="modal-shade"><section class="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title"><div class="modal-top"><span class="eyebrow">${mode==="examples"?"Fictional preview":"WIF commitment"}</span><button data-act="close-review" aria-label="Close review" ${busy?"disabled":""}>×</button></div><h2 id="review-title">${creating?"Review your session.":"Keep a place for yourself."}</h2><p>${creating?"The price, times and refund conditions become fixed when published.":"Your WIF is held by the booking contract under the session’s published terms."}</p><dl><dt>${creating?"Creator bond":"Reservation"}</dt><dd>${formatWif(amount)} WIF</dd><dt>Session</dt><dd>${esc(creating?draft.title:s!.metadata.title)}</dd><dt>Booking cutoff</dt><dd>${esc(date(t?t.deadline:s!.deadline))}</dd><dt>Group minimum</dt><dd>${t?t.minimum:s!.minimum} reservations</dd><dt>Network</dt><dd>WIF on Robinhood Chain · 4663</dd></dl><div class="review-policy">${check}<p>${creating?"You receive the bond back for an underfilled or completed session. A confirmed cancellation or missed check-in forfeits it.":"Leave before cutoff for a full refund. If the group falls short, claim your full WIF reservation from the contract."}</p></div>${mode==="examples"?'<p class="example-review">This action changes a fictional example. No wallet signature or WIF transfer occurs.</p>':'<p class="field-note">Your wallet may first request an exact WIF allowance, then the booking transaction. Network gas is paid in ETH.</p>'}<button class="button dark full" data-act="confirm-review" ${busy?"disabled":""}>${busy?esc(status||"Waiting for your transaction…"):mode==="examples"?(creating?"Publish the example":"Confirm preview reservation"):(creating?"Approve bond & publish":"Confirm WIF reservation")} ${arrow}</button></section></div>`;
}
function footer(){return `<footer><a class="brand" href="/" data-act="home">Rally<span class="brand-dot">.</span></a><p>Good plans. Shared commitments.</p><div><a href="https://github.com/NSEVEjk0/rally-wif" target="_blank" rel="noopener noreferrer">Source ↗</a><a href="https://worldisflat.fun" target="_blank" rel="noopener noreferrer">World Is Flat ↗</a></div></footer>`;}
function render(){
  const s=current();root.innerHTML=`${header()}${modebar()}<main id="main">${error?`<div role="alert" class="error">${esc(error)}</div>`:""}${status?`<div class="transaction-status" role="status">${esc(status)}</div>`:""}${receipt?`<div class="receipt">${check} Transaction included at block ${receipt.block}. <a href="${chain.explorer}/tx/${receipt.hash}" target="_blank" rel="noopener noreferrer">View receipt ↗</a></div>`:""}${mode==="live"&&chain.account()?`<div class="account-strip"><span>${formatWif(liveBalance)} WIF in your connected wallet</span>${credit>0n?`<button data-act="claimCredit">Claim ${formatWif(credit)} WIF host credit →</button>`:""}</div>`:""}${view==="browse"?browse():view==="host"?hostPage():s?sessionPage(s):'<div class="empty"><h2>Reading this session…</h2><button class="button outline" data-act="refresh">Refresh the contract</button></div>'}</main>${footer()}${reviewDialog()}`;
  const form=root.querySelector<HTMLFormElement>("#host-form");
  form?.addEventListener("input",()=>{
    if(review||busy)return;
    const data=new FormData(form),get=(key:string)=>String(data.get(key)??"");
    draft={...draft,title:get("title"),description:get("description"),category:get("category"),format:get("format")==="in-person"?"in-person":"online",location:get("location"),website:get("website"),price:get("price"),minimum:Number(get("minimum")),capacity:Number(get("capacity")),deadline:get("deadline"),startAt:get("startAt"),endAt:get("endAt")};saveDraft();
    const output=root.querySelector("#draft-bond");
    if(output){try{output.textContent=formatWif(bondFor(parseWif(draft.price),draft.minimum));}catch{output.textContent="—";}}
  });
  form?.addEventListener("submit",e=>{e.preventDefault();try{review={kind:"create",terms:draftTerms(draft,now())};error="";}catch(e){error=(e as Error).message;}render();});
  if(review)queueMicrotask(()=>root.querySelector<HTMLButtonElement>(".review-modal button:not([disabled])")?.focus({preventScroll:true}));
}
async function refreshLive(){
  if(mode!=="live")return;
  loading=true;render();
  try{
    if(!chain.deployed()){liveSessions=[];return;}
    liveSessions=await chain.sessions(view==="session"?selectedId:undefined);
    if(chain.account()){
      const details=await chain.accountDetails(chain.account()!,liveSessions.map(s=>s.id));
      liveBalance=details.balance;credit=details.credit;reserved=details.reserved;
    }
  }catch(e){error=(e as Error).message.slice(0,400);}finally{loading=false;render();}
}
function updateUrl(){const url=new URL(location.href);url.search="";
  if(view==="session"){url.searchParams.set("round",selectedId.toString());url.searchParams.set("mode",mode==="examples"?"example":"live");}
  else if(mode==="live")url.searchParams.set("mode","live");
  history.replaceState({},"",url);
}
async function transact(action:()=>Promise<{hash:Hash;block:bigint}>){
  busy=true;status="Preparing your wallet transaction…";render();
  try{receipt=await action();status="";review=undefined;await refreshLive();toast("Your transaction is included. The receipt is linked above.");}
  catch(e){error=(e as Error).message.slice(0,400);status="";}
  finally{busy=false;render();}
}
function progress(message:string){status=message;render();}
function exampleAction(name:string,s:Session){
  const p=effectivePhase(s,now());
  if(name==="reserve"){
    if(p!=="funding"||isReserved(s)||isHost(s)||s.seats>=s.capacity||demoBalance<s.price)throw new Error("This example reservation is unavailable.");
    demoReservations.add(s.id.toString());demoBalance-=s.price;s.seats++;toast("Preview place reserved. No WIF was moved.");
  }else if(name==="leave"){
    if(p!=="funding"||!isReserved(s))throw new Error("The example can no longer be left before cutoff.");
    demoReservations.delete(s.id.toString());s.seats--;demoBalance+=s.price;toast("Your full preview reservation was returned.");
  }else if(name==="refund"){
    const amount=refundable(s,isReserved(s),now());if(!amount)throw new Error("No example refund is available.");
    s.phase=p;s.bonusPerSeat=p==="missed"?s.bond/BigInt(s.seats):s.bonusPerSeat;
    demoReservations.delete(s.id.toString());s.refunds++;demoBalance+=amount;toast(`${formatWif(amount)} WIF added to the fictional preview balance.`);
  }else if(name==="checkIn"){
    if(!isHost(s)||!checkInAvailable(s,now()))throw new Error("The host check-in window is closed.");
    s.phase="confirmed";s.checkedIn=true;toast("Example host check-in recorded. No onchain action occurred.");
  }else if(name==="cancel"){
    if(!isHost(s)||(p!=="funding"&&p!=="confirmed"))throw new Error("This example session cannot be cancelled.");
    s.phase="cancelled";s.bonusPerSeat=p==="confirmed"?s.bond/BigInt(s.seats):0n;toast("Example cancelled; applicable refunds are now available.");
  }else if(name==="complete"){
    if(p!=="confirmed"||!s.checkedIn||now()<s.endAt)throw new Error("Completion conditions have not been met.");
    s.phase="completed";toast("Example completion shown. No revenue was paid.");
  }
}
root.addEventListener("click",async e=>{
  if(!(e.target instanceof Element))return;
  const target=e.target.closest<HTMLElement>("[data-act]");if(!target)return;e.preventDefault();
  const action=target.dataset.act;if(busy)return;error="";
  try{
    if(action==="home"){view="browse";updateUrl();render();window.scrollTo(0,0);return;}
    if(action==="how"||action==="browse"){view="browse";render();document.querySelector(action==="how"?"#how-it-works":"#sessions")?.scrollIntoView({behavior:"smooth"});return;}
    if(action==="host"){view="host";review=undefined;render();window.scrollTo(0,0);return;}
    if(action==="examples"||action==="live"){mode=action==="examples"?"examples":"live";view="browse";review=undefined;receipt=undefined;updateUrl();render();await refreshLive();return;}
    if(action==="refresh"){await refreshLive();if(mode==="examples")render();return;}
    if(action==="filter"){filter=target.dataset.filter!;render();return;}
    if(action==="connect"){await chain.connect();toast("Wallet connected. WIF bookings use Robinhood Chain.");await refreshLive();render();return;}
    if(action==="open"){selectedId=BigInt(target.dataset.id!);view="session";updateUrl();render();window.scrollTo(0,0);return;}
    if(action==="close-review"){review=undefined;render();return;}
    if(action==="claimCredit"){await transact(()=>chain.sessionAction("claimCredit",undefined,progress));return;}
    if(action==="confirm-review"&&review){
      const queued=review;
      if(mode==="examples"){
        if(queued.kind==="reserve")exampleAction("reserve",queued.session);
        else{
          const t=queued.terms,bond=bondFor(t.price,t.minimum);if(demoBalance<bond)throw new Error("The fictional preview balance does not cover this bond.");
          demoBalance-=bond;const id=exampleSessions.reduce((max,s)=>s.id>max?s.id:max,0n)+1n;
          const meta=JSON.parse(t.metadata) as Session["metadata"];
          exampleSessions.unshift({...t,id,creator:"you-example",bond,bonusPerSeat:0n,seats:0,refunds:0,phase:"funding",checkedIn:false,termsHash:"Example fixed terms",metadata:meta,example:true});
          selectedId=id;view="session";toast("Your fictional session is ready to explore.");
        }
        review=undefined;updateUrl();render();return;
      }
      if(queued.kind==="reserve"){await transact(()=>chain.reserveSession(queued.session,progress));return;}
      if(queued.terms.deadline<Math.floor(Date.now()/1000)+300)throw new Error("The cutoff is now too close. Close this review and choose a later cutoff.");
      await transact(async()=>{const result=await chain.createSession(queued.terms,progress);if(result.id){selectedId=result.id;view="session";updateUrl();}return result;});return;
    }
    const s=current();if(!s)return;
    if(action==="reserve"){review={kind:"reserve",session:s};render();return;}
    if(action==="calendar"){download(`rally-session-${s.id}.ics`,calendar(s,now(),location.href),"text/calendar");return;}
    if(action==="share"){await navigator.clipboard.writeText(location.href);toast("Session link copied.");return;}
    if(action==="repeat"){draft=repeatDraft(s,now());saveDraft();view="host";render();window.scrollTo(0,0);return;}
    if(s.example&&["cutoff","missed","start","end","example-host"].includes(action!)){
      if(action==="cutoff")exampleNow=s.deadline;
      if(action==="missed")exampleNow=s.startAt+CHECKIN_GRACE+1;
      if(action==="start")exampleNow=s.startAt;
      if(action==="end")exampleNow=s.endAt;
      if(action==="example-host")s.creator="you-example";
      render();return;
    }
    if(["leave","refund","cancel","checkIn","complete"].includes(action!)){
      if(s.example){exampleAction(action!,s);render();return;}
      await transact(()=>chain.sessionAction(action as "leave"|"refund"|"cancel"|"checkIn"|"complete",s.id,progress));return;
    }
  }catch(e){error=(e as Error).message.slice(0,400);render();}
});
document.addEventListener("keydown",e=>{
  if(!review)return;
  if(e.key==="Escape"&&!busy){review=undefined;render();}
  if(e.key==="Tab"){
    const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(".review-modal button:not([disabled])"));
    if(!buttons.length)return;
    const first=buttons[0],last=buttons[buttons.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
const params=new URL(location.href).searchParams;
if(params.get("mode")==="live")mode="live";
const id=params.get("round");if(id&&/^\d{1,20}$/.test(id)&&BigInt(id)>0n&&BigInt(id)<2n**64n){selectedId=BigInt(id);view="session";if(params.get("mode")!=="example")mode="live";}
chain.watchWallet(()=>{liveBalance=0n;credit=0n;reserved=new Set();render();});
render();void refreshLive();
