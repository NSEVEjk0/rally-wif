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
const categoryLabel=(category:string)=>category==="All sessions"?"All events":category==="Feedback circle"?"Feedback session":category;
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
function phaseText(s:Session){const p=effectivePhase(s,now());return {funding:s.seats>=s.minimum?"Minimum bookings reached":"Waiting for more bookings",confirmed:"Event confirmed",completed:"Event finished",underfilled:"Not enough bookings",cancelled:"Event cancelled",missed:"Host did not check in"}[p];}
function header(){return `<header><a class="brand" href="/" data-act="home"><span class="logo">r</span>Rally<span class="brand-dot">.</span></a><nav aria-label="Main navigation"><a href="#how-it-works" data-act="how">How it works</a><button class="text-button" data-act="host">Host an event</button></nav><div class="wallet"><span class="network"><i></i>WIF · Robinhood Chain</span><button class="button small ${chain.account()?"subtle":"dark"}" data-act="connect">${chain.account()?esc(short(chain.account()!)):"Connect wallet"}</button></div></header>`;}
function modebar(){return `<div class="modebar"><div><span class="example-dot"></span>${mode==="examples"?"Sample events · fictional hosts and bookings. No real WIF is used.":"Live bookings · these use real WIF on Robinhood Chain."}</div><div class="segmented" aria-label="Event mode"><button data-act="examples" aria-pressed="${mode==="examples"}">Sample events</button><button data-act="live" aria-pressed="${mode==="live"}">Live bookings</button></div></div>`;}
function hero(){return `<section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="tiny-star">✳</span> Refundable bookings for small events</p><h1>Book a place.<br><span>Join a small event.</span></h1><p class="lede">Rally lets you book a place in a workshop, meetup or feedback session. Pay with WIF, a cryptocurrency token. If the event does not get enough bookings, you can claim your full payment back.</p><div class="hero-actions"><button class="button dark" data-act="browse">Browse events ${arrow}</button><button class="button outline" data-act="host">Host an event</button></div><p class="hero-note">Real bookings need a wallet, WIF for payment and ETH for network fees.</p></div><div class="hero-art" aria-label="Illustration of a fictional sample workshop"><div class="art-note">Book with WIF.<br>See the refund rules. <span>↘</span></div><div class="session-paper"><span class="paper-top">RALLY / SAMPLE EVENT</span><div class="paper-date">${month(initialNow+3*86400)}<strong>${day(initialNow+3*86400)}</strong></div><h2>A workshop.<br>A booked place.<br>A clear refund rule.</h2><div class="paper-bottom"><span>Book one place.<br>Bring your laptop.</span><span class="sunburst">✳</span></div></div><span class="orbit o1">✳</span><span class="orbit o2">+</span><span class="orbit o3">↗</span><span class="paper-sticker">PAY<br><strong>with WIF</strong></span></div></section>`;}
function card(s:Session,index:number){const p=effectivePhase(s,now()),progress=Math.min(100,Math.round(s.seats/s.minimum*100));return `<article class="session-card"><button class="card-art art-${index%3}" data-act="open" data-id="${s.id}" aria-label="View ${esc(s.metadata.title)}"><span class="category">${esc(categoryLabel(s.metadata.category))}</span><span class="art-symbol">${["✳","↗","☕"][index%3]}</span><span class="date-ticket">${esc(month(s.startAt))}<strong>${esc(day(s.startAt))}</strong></span>${s.example?'<span class="fictional">Example</span>':""}</button><div class="card-body"><p class="session-format">${s.metadata.format==="online"?"↗ Online":"⌖ In person"} · ${esc(date(s.startAt))}</p><h3><button data-act="open" data-id="${s.id}">${esc(s.metadata.title)}</button></h3><p class="host-line">${s.example?"Fictional sample host":`Host ${esc(short(s.creator))}`}</p><div class="seat-progress" role="img" aria-label="${s.seats} of ${s.minimum} bookings needed"><span style="width:${progress}%"></span></div><div class="seat-line"><span>${s.seats} / ${s.minimum} bookings needed</span><span>${s.capacity} places total</span></div><div class="card-bottom"><span class="price">${formatWif(s.price)} <small>WIF per place</small></span><button class="round-button" data-act="open" data-id="${s.id}" aria-label="View event">${arrow}</button></div><span class="phase ${p}">${check}${esc(phaseText(s))}</span></div></article>`;}
function how(){return `<section id="how-it-works" class="how"><div><p class="eyebrow">How booking and refunds work</p><h2>See the rules.<br>Then book your place.</h2><p>For example: a workshop needs 2 bookings at 5 WIF each. If only 1 place is booked by the deadline, that participant can claim all 5 WIF back.</p></div><article><span class="step">01</span><h3>The host creates an event.</h3><p>The host sets a price, dates and minimum bookings, then pays a WIF deposit.</p></article><article><span class="step">02</span><h3>You pay for one place.</h3><p>Book with WIF. Cancel your booking before the deadline to get your full payment back.</p></article><article><span class="step">03</span><h3>Enough bookings, or a refund.</h3><p>Enough bookings confirm the event. If there are too few at the deadline, claim your full payment back from your wallet. You do not need the host’s approval.</p></article></section>`;}
function browse(){const list=collection().filter(s=>filter==="All sessions"||s.metadata.category===filter);return `${hero()}<section id="sessions" class="sessions"><div class="section-heading"><div><p class="eyebrow">Browse workshops, meetups and feedback sessions</p><h2>Choose an event.</h2></div><p>${mode==="examples"?"Practice booking and claiming a refund with these fictional events.":"See the price, dates and refund rules before you pay."}</p></div><div class="filters" aria-label="Event types">${["All sessions","Workshop","Feedback circle","Meetup"].map(f=>`<button class="${filter===f?"active":""}" data-act="filter" data-filter="${f}">${categoryLabel(f)}</button>`).join("")}<button class="text-button refresh" data-act="refresh">↻ Refresh</button></div>${loading?'<div class="empty">Loading events and booking details…</div>':list.length?`<div class="session-grid">${list.map(card).join("")}</div>`:`<div class="empty"><span>✳</span><h3>${chain.deployed()?"No events found.":"Real bookings are not available yet."}</h3><p>${chain.deployed()?"Try another event type or create an event.":"Use the fictional sample events to try booking and refunds."}</p><button class="button dark" data-act="${chain.deployed()?"host":"examples"}">${chain.deployed()?"Host an event":"Sample events"}${arrow}</button></div>`}</section>${how()}<section class="host-cta"><span class="cta-star">✳</span><div><p class="eyebrow">For workshop hosts and meetup organisers</p><h2>Create an event people can book.</h2><p>Set the dates, price and minimum bookings. Publish the event with your WIF deposit.</p></div><button class="button lime" data-act="host">Create your first event ${arrow}</button></section>`;}
function sessionPage(s:Session){
  const p=effectivePhase(s,now()),has=isReserved(s),host=isHost(s),amount=refundable(s,has,now());
  const canBook=p==="funding"&&s.seats<s.capacity&&!has&&!host;
  const minimumPayout=completionAmounts(s.price,s.minimum,s.bond);
  return `<section class="session-detail"><button class="back" data-act="home">← All events</button><div class="detail-grid"><div><div class="detail-art art-${Number(s.id)%3}"><span class="category">${esc(categoryLabel(s.metadata.category))}</span><span class="art-symbol">✳</span><span class="date-ticket">${month(s.startAt)}<strong>${day(s.startAt)}</strong></span>${s.example?'<span class="fictional">Fictional sample</span>':""}</div><p class="eyebrow detail-eyebrow">${s.metadata.format==="online"?"Online":"In person"} · ${esc(date(s.startAt))}</p><h1>${esc(s.metadata.title)}</h1><p class="detail-description">${esc(s.metadata.description)}</p><div class="detail-facts"><div><span>Where</span><strong>${esc(s.metadata.location||s.metadata.format)}</strong></div><div><span>Booking deadline</span><strong>${esc(date(s.deadline))}</strong></div><div><span>Event ends</span><strong>${esc(date(s.endAt))}</strong></div><div><span>Event host</span><strong>${s.example?"Fictional sample host":esc(short(s.creator))}</strong></div></div>${s.metadata.website?`<a class="source-link" href="${esc(s.metadata.website)}" rel="noopener noreferrer" target="_blank">More event information ↗</a>`:""}<div class="detail-tools"><button class="button outline" data-act="calendar">Add to calendar ↗</button><button class="button outline" data-act="share">Copy event link</button>${host?'<button class="button outline" data-act="repeat">Copy this event for next time</button>':""}</div><div class="terms"><h2>Your booking and refund rules.</h2><div>${check}<p><strong>Cancel your booking before the deadline.</strong> Get your full ${formatWif(s.price)} WIF back.</p></div><div>${check}<p><strong>${s.minimum} bookings are needed.</strong> If there are too few bookings at the deadline, you can claim all your payment back without the host’s approval.</p></div><div>${check}<p><strong>A ${formatWif(s.bond)} WIF host deposit.</strong> If the host cancels a confirmed event or does not check in on time, booked participants get their payment back plus a share of this deposit.</p></div><div>${check}<p><strong>When the host gets paid.</strong> After the host checks in and the event’s end time passes, the host can withdraw booking payments and their deposit. A 1% fee is taken from booking payments.</p></div><p class="terms-note">The host checks in with a wallet transaction near the start time. Rally cannot confirm actual attendance or event quality. Claiming a refund needs a wallet transaction and network fees. One booking per wallet; wallets are not unique people.</p></div>${!s.example?`<details class="contract-details"><summary>View contract details</summary><dl><dt>Record of the original booking rules</dt><dd>${esc(s.termsHash)}</dd><dt>Contract</dt><dd><a href="${chain.explorer}/address/${chain.contractAddress()}" target="_blank" rel="noopener noreferrer">${chain.contractAddress()} ↗</a></dd><dt>Host payment if exactly the minimum places are booked, including deposit</dt><dd>${formatWif(minimumPayout.creator)} WIF</dd></dl></details>`:""}</div><aside class="booking-panel"><span class="phase ${p}">${check}${phaseText(s)}</span><p class="booking-price">${formatWif(s.price)}<span> WIF</span></p><p class="per-place">for one place. WIF is a cryptocurrency token.</p><div class="seat-progress"><span style="width:${Math.min(100,s.seats/s.minimum*100)}%"></span></div><div class="seat-line"><span>${s.seats} of ${s.minimum} bookings needed</span><span>${Math.max(0,s.capacity-s.seats)} places left</span></div><hr>${has?`<div class="reservation-state">${check} ${s.example?"Your sample place is booked. No real payment was made.":"Your place is booked."}</div>`:""}${canBook?`<button class="button dark full" data-act="reserve">${s.example?"Try a sample booking":"Book this place with WIF"}${arrow}</button>`:""}${has&&p==="funding"?'<button class="button outline full" data-act="leave">Cancel booking & get a full refund</button>':""}${amount>0n?`<div class="refund-callout"><strong>${formatWif(amount)} WIF ready to refund</strong><p>${p==="underfilled"?"This event did not get enough bookings.":"Your booking payment and any share of the host deposit are ready to claim."}</p><button class="button dark full" data-act="refund">${s.example?"Try a sample refund":"Claim your refund"}${arrow}</button></div>`:""}${host?`<div class="host-controls"><p class="eyebrow">Manage your event</p>${checkInAvailable(s,now())?'<button class="button dark full" data-act="checkIn">Check in for this event</button>':""}${p==="confirmed"&&s.checkedIn&&now()>=s.endAt?'<button class="button dark full" data-act="complete">Finish the event & release payments</button>':""}${(p==="funding"||p==="confirmed")?'<button class="button outline full" data-act="cancel">Cancel this event</button>':""}<button class="button outline full" data-act="repeat">Copy this event for next time</button></div>`:""}<div class="booking-small"><span>Booking deadline</span><strong>${esc(date(s.deadline))}</strong><span>Time allowed for the host to check in</span><strong>${esc(date(s.startAt-CHECKIN_GRACE))} – ${esc(date(s.startAt+CHECKIN_GRACE))}</strong></div>${s.example?`<div class="example-controls"><p>Try different sample outcomes</p><button data-act="cutoff">Move to booking deadline</button><button data-act="missed">Show missed host check-in</button><button data-act="start">Move to event start</button><button data-act="end">Move to event end</button>${!host?'<button data-act="example-host">Try managing this sample event</button>':""}<span>Sample balance: ${formatWif(demoBalance)} WIF · no real funds</span></div>`:""}</aside></div></section>`;
}
function hostPage(){
  let bond="—";try{bond=formatWif(bondFor(parseWif(draft.price),draft.minimum));}catch{}
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const input=(label:string,name:keyof Draft,type="text",extra="")=>`<label>${label}<input name="${name}" type="${type}" value="${esc(draft[name])}" ${extra}></label>`;
  return `<section class="host-page"><button class="back" data-act="home">← All events</button><div class="section-heading"><div><p class="eyebrow">Create a workshop, meetup or feedback session</p><h1>Create your event.</h1></div><span class="draft-badge">Saved here until you publish</span></div><div class="host-grid"><form id="host-form"><div class="form-card"><h2>Event details</h2>${input("Event title","title","text",'required maxlength="90" placeholder="e.g. Build a simple website"')}<label>What will participants do?<textarea name="description" maxlength="700" rows="4" placeholder="Describe the activities, who the event is for and what participants should bring.">${esc(draft.description)}</textarea></label><div class="two-cols"><label>Event type<select name="category">${["Workshop","Feedback circle","Meetup"].map(c=>`<option value="${c}" ${draft.category===c?"selected":""}>${categoryLabel(c)}</option>`).join("")}</select></label><label>Online or in person<select name="format"><option value="online" ${draft.format==="online"?"selected":""}>Online</option><option value="in-person" ${draft.format==="in-person"?"selected":""}>In person</option></select></label></div>${input("Where will it happen?","location","text",'maxlength="120" placeholder="e.g. A community centre or an online call"')}${input("More event information (optional)","website","url",'maxlength="300" placeholder="https://"')}<p class="field-note">Event details and wallet addresses are public. Share private meeting links directly with participants.</p></div><div class="form-card"><h2>Price, bookings and dates</h2><div class="two-cols">${input("Price per place (WIF)","price","text",'inputmode="decimal" required')}${input("Minimum bookings needed","minimum","number",'min="2" max="100" required')}</div>${input("Maximum number of places","capacity","number",'min="2" max="100" required')}<p class="field-note">At least 2 bookings are needed. You can offer up to 100 places. Each wallet can book one place.</p><div class="two-cols">${input("Booking deadline","deadline","datetime-local","required")}${input("Event starts","startAt","datetime-local","required")}</div>${input("Event ends","endAt","datetime-local","required")}<p class="field-note">Times use ${esc(tz)}. Start at least 30 minutes after the booking deadline. Events last 15 minutes to 8 hours.</p></div><button type="submit" class="button dark full">Review event details and deposit ${arrow}</button></form><aside class="host-summary"><span class="summary-star">✳</span><h2>Why hosts pay<br>a deposit.</h2><p>You pay this deposit before bookings open. If a confirmed event is cancelled or you miss check-in, the deposit goes to booked participants.</p><div class="bond-display"><span>Your host deposit</span><strong><output id="draft-bond">${bond}</output> <small>WIF</small></strong><p>Example: 5 WIF per place and 2 required bookings means a 5 WIF deposit.</p></div><ul><li>Not enough bookings: you can withdraw your deposit.</li><li>Host checks in and end time passes: withdraw booking payments and your deposit.</li><li>Confirmed event cancelled or host check-in missed: deposit shared among booked participants.</li></ul><p class="field-note">A 1% fee is taken from completed booking payments. Dates, prices and refund rules cannot be changed after you publish.</p>${draft.parentRound!=="0"?`<p class="repeat-note">A copy of event #${esc(draft.parentRound)}. Choose new dates. Previous bookings do not carry over.</p>`:""}</aside></div></section>`;
}
function reviewDialog(){
  if(!review)return "";
  const creating=review.kind==="create",t=review.kind==="create"?review.terms:undefined,s=review.kind==="reserve"?review.session:undefined;
  const amount=t?bondFor(t.price,t.minimum):s!.price;
  return `<div class="modal-shade"><section class="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title"><div class="modal-top"><span class="eyebrow">${mode==="examples"?"Fictional sample":"Review before you pay"}</span><button data-act="close-review" aria-label="Close review" ${busy?"disabled":""}>×</button></div><h2 id="review-title">${creating?"Review your event.":"Review your booking."}</h2><p>${creating?"The price, dates and refund rules cannot be changed after you publish.":"Your payment is held in the booking contract. Check the price, deadline and refund rules before you pay."}</p><dl><dt>${creating?"Host deposit":"Booking payment"}</dt><dd>${formatWif(amount)} WIF</dd><dt>Event</dt><dd>${esc(creating?draft.title:s!.metadata.title)}</dd><dt>Booking deadline</dt><dd>${esc(date(t?t.deadline:s!.deadline))}</dd><dt>Minimum bookings</dt><dd>${t?t.minimum:s!.minimum} bookings</dd><dt>Network</dt><dd>WIF on Robinhood Chain · 4663</dd></dl><div class="review-policy">${check}<p>${creating?"You can withdraw your deposit if there are too few bookings. After you check in and the event’s end time passes, you can withdraw booking payments and your deposit. Cancel a confirmed event or miss check-in, and your deposit goes to booked participants.":"Cancel before the booking deadline for a full refund. If there are too few bookings at the deadline, you can claim your full payment without the host’s approval."}</p></div>${mode==="examples"?'<p class="example-review">This changes a fictional sample. No wallet signature or WIF payment is needed.</p>':'<p class="field-note">Your wallet may ask for two transactions: permission to use only this WIF amount, then the payment. You also need ETH for network fees.</p>'}<button class="button dark full" data-act="confirm-review" ${busy?"disabled":""}>${busy?esc(status||"Waiting for your transaction…"):mode==="examples"?(creating?"Save sample event":"Confirm sample booking"):(creating?"Pay deposit & publish event":"Confirm booking payment")} ${arrow}</button></section></div>`;
}
function footer(){return `<footer><a class="brand" href="/" data-act="home">Rally<span class="brand-dot">.</span></a><p>Book small events. See the refund rules.</p><div><a href="https://github.com/NSEVEjk0/rally-wif" target="_blank" rel="noopener noreferrer">View the code ↗</a><a href="https://worldisflat.fun" target="_blank" rel="noopener noreferrer">World Is Flat ↗</a></div></footer>`;}
function render(){
  const s=current();root.innerHTML=`${header()}${modebar()}<main id="main">${error?`<div role="alert" class="error">${esc(error)}</div>`:""}${status?`<div class="transaction-status" role="status">${esc(status)}</div>`:""}${receipt?`<div class="receipt">${check} Your wallet transaction is confirmed. <a href="${chain.explorer}/tx/${receipt.hash}" target="_blank" rel="noopener noreferrer">View wallet receipt ↗</a></div>`:""}${mode==="live"&&chain.account()?`<div class="account-strip"><span>${formatWif(liveBalance)} WIF in your connected wallet</span>${credit>0n?`<button data-act="claimCredit">Withdraw ${formatWif(credit)} WIF →</button>`:""}</div>`:""}${view==="browse"?browse():view==="host"?hostPage():s?sessionPage(s):'<div class="empty"><h2>Loading this event…</h2><button class="button outline" data-act="refresh">Reload event details</button></div>'}</main>${footer()}${reviewDialog()}`;
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
  try{receipt=await action();status="";review=undefined;await refreshLive();toast("Your wallet transaction is confirmed. You can open its receipt above.");}
  catch(e){error=(e as Error).message.slice(0,400);status="";}
  finally{busy=false;render();}
}
function progress(message:string){status=message;render();}
function exampleAction(name:string,s:Session){
  const p=effectivePhase(s,now());
  if(name==="reserve"){
    if(p!=="funding"||isReserved(s)||isHost(s)||s.seats>=s.capacity||demoBalance<s.price)throw new Error("You cannot book this sample place right now.");
    demoReservations.add(s.id.toString());demoBalance-=s.price;s.seats++;toast("Sample place booked. No real WIF was used.");
  }else if(name==="leave"){
    if(p!=="funding"||!isReserved(s))throw new Error("This sample booking is past its cancellation deadline.");
    demoReservations.delete(s.id.toString());s.seats--;demoBalance+=s.price;toast("Your sample booking payment was returned in full.");
  }else if(name==="refund"){
    const amount=refundable(s,isReserved(s),now());if(!amount)throw new Error("There is no sample refund to claim.");
    s.phase=p;s.bonusPerSeat=p==="missed"?s.bond/BigInt(s.seats):s.bonusPerSeat;
    demoReservations.delete(s.id.toString());s.refunds++;demoBalance+=amount;toast(`${formatWif(amount)} WIF returned to your fictional sample balance.`);
  }else if(name==="checkIn"){
    if(!isHost(s)||!checkInAvailable(s,now()))throw new Error("It is outside the allowed time for host check-in.");
    s.phase="confirmed";s.checkedIn=true;toast("Sample host check-in recorded. No real wallet transaction occurred.");
  }else if(name==="cancel"){
    if(!isHost(s)||(p!=="funding"&&p!=="confirmed"))throw new Error("This sample event cannot be cancelled right now.");
    s.phase="cancelled";s.bonusPerSeat=p==="confirmed"?s.bond/BigInt(s.seats):0n;toast("Sample event cancelled. Participants can try claiming their refunds.");
  }else if(name==="complete"){
    if(p!=="confirmed"||!s.checkedIn||now()<s.endAt)throw new Error("The host must check in and the event must reach its end time before payment can be released.");
    s.phase="completed";toast("Sample event finished. No real payment was made.");
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
          const t=queued.terms,bond=bondFor(t.price,t.minimum);if(demoBalance<bond)throw new Error("Your fictional sample balance is too small for this deposit.");
          demoBalance-=bond;const id=exampleSessions.reduce((max,s)=>s.id>max?s.id:max,0n)+1n;
          const meta=JSON.parse(t.metadata) as Session["metadata"];
          exampleSessions.unshift({...t,id,creator:"you-example",bond,bonusPerSeat:0n,seats:0,refunds:0,phase:"funding",checkedIn:false,termsHash:"Example fixed terms",metadata:meta,example:true});
          selectedId=id;view="session";toast("Your fictional sample event is ready to try.");
        }
        review=undefined;updateUrl();render();return;
      }
      if(queued.kind==="reserve"){await transact(()=>chain.reserveSession(queued.session,progress));return;}
      if(queued.terms.deadline<Math.floor(Date.now()/1000)+300)throw new Error("The booking deadline is now too close. Close this review and choose a later deadline.");
      await transact(async()=>{const result=await chain.createSession(queued.terms,progress);if(result.id){selectedId=result.id;view="session";updateUrl();}return result;});return;
    }
    const s=current();if(!s)return;
    if(action==="reserve"){review={kind:"reserve",session:s};render();return;}
    if(action==="calendar"){download(`rally-session-${s.id}.ics`,calendar(s,now(),location.href),"text/calendar");return;}
    if(action==="share"){await navigator.clipboard.writeText(location.href);toast("Event link copied.");return;}
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
