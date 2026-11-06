export const CHAIN_ID = 4663;
export const WIF = "0x5173b8eA6923c2d40267890D45C46a3480954773";
export const UNIT = 10n ** 18n;
export const FEE_BPS = 100n;
export const CHECKIN_GRACE = 900;
export const MAX_PRICE = 1_000_000n * UNIT;

export type Phase = "funding" | "confirmed" | "completed" | "underfilled" | "cancelled" | "missed";
export type SessionMeta = {title:string;description:string;category:string;format:"online"|"in-person";location:string;website:string};
export type Session = {
  id:bigint;creator:string;price:bigint;bond:bigint;bonusPerSeat:bigint;minimum:number;capacity:number;
  seats:number;refunds:number;deadline:number;startAt:number;endAt:number;parentRound:bigint;
  phase:Phase;checkedIn:boolean;termsHash:string;metadata:SessionMeta;example:boolean;
};
export type Draft = {title:string;description:string;category:string;format:"online"|"in-person";location:string;
  website:string;price:string;minimum:number;capacity:number;deadline:string;startAt:string;endAt:string;parentRound:string};
export type Terms = {price:bigint;minimum:number;capacity:number;deadline:number;startAt:number;endAt:number;parentRound:bigint;metadata:string};

export function parseWif(text:string):bigint {
  if (!/^(0|[1-9]\d{0,6})(\.\d{1,18})?$/.test(text)) throw new Error("Enter a positive WIF amount, with at most 18 decimal places.");
  const [whole,fraction=""] = text.split(".");
  const amount = BigInt(whole) * UNIT + BigInt(fraction.padEnd(18,"0"));
  if (amount === 0n || amount > MAX_PRICE) throw new Error("The price must be greater than zero and at most 1,000,000 WIF.");
  return amount;
}
export function formatWif(amount:bigint):string {
  const whole = amount / UNIT;
  const fraction = (amount % UNIT).toString().padStart(18,"0").replace(/0+$/, "");
  return whole.toString() + (fraction ? `.${fraction}` : "");
}
export function bondFor(price:bigint,minimum:number):bigint {return price * BigInt(minimum) / 2n;}
export function completionAmounts(price:bigint,seats:number,bond:bigint) {
  const gross=price*BigInt(seats),sink=gross*FEE_BPS/10_000n;
  return {gross,sink,creator:gross-sink+bond};
}
export function effectivePhase(s:Session,now:number):Phase {
  let p=s.phase;
  if(p==="funding"&&now>=s.deadline) p=s.seats<s.minimum?"underfilled":"confirmed";
  if(p==="confirmed"&&!s.checkedIn&&now>s.startAt+CHECKIN_GRACE) p="missed";
  return p;
}
export function refundable(s:Session,reserved:boolean,now:number):bigint {
  if(!reserved)return 0n;
  const p=effectivePhase(s,now);
  if(p==="missed")return s.price+s.bond/BigInt(s.seats);
  if(p==="cancelled")return s.price+s.bonusPerSeat;
  if(p==="underfilled")return s.price;
  return 0n;
}
export function checkInAvailable(s:Session,now:number):boolean {
  return effectivePhase(s,now)==="confirmed"&&!s.checkedIn&&now>=s.startAt-CHECKIN_GRACE&&now<=s.startAt+CHECKIN_GRACE;
}
export function readMeta(raw:string):SessionMeta {
  let m:unknown;
  try {m=JSON.parse(raw);}catch {m={};}
  const record=m&&typeof m==="object"?m as Record<string,unknown>:{};
  const read=(key:string,max:number)=>typeof record[key]==="string"?(record[key] as string).slice(0,max):"";
  let website=read("website",300);
  try{if(new URL(website).protocol!=="https:")website="";}catch{website="";}
  return {title:read("title",90)||"Community session",description:read("description",700),category:read("category",40)||"Community",
    format:record.format==="in-person"?"in-person":"online",location:read("location",120),website};
}
export function draftTerms(d:Draft,now:number):Terms {
  const price=parseWif(d.price);
  if(!d.title.trim()||d.title.trim().length>90)throw new Error("Enter an event title between 1 and 90 characters.");
  if(!Number.isInteger(d.minimum)||d.minimum<2||!Number.isInteger(d.capacity)||d.minimum>d.capacity||d.capacity>100)throw new Error("Set a minimum of at least 2 and a capacity up to 100.");
  const deadline=Math.floor(new Date(d.deadline).getTime()/1000),startAt=Math.floor(new Date(d.startAt).getTime()/1000),endAt=Math.floor(new Date(d.endAt).getTime()/1000);
  if(![deadline,startAt,endAt].every(Number.isSafeInteger))throw new Error("Choose all three dates.");
  if(deadline<now+300||deadline>now+30*86400)throw new Error("Choose a booking deadline between 5 minutes and 30 days from now.");
  if(startAt<deadline+1800||startAt>now+45*86400)throw new Error("Start the event at least 30 minutes after the booking deadline and within the next 45 days.");
  if(endAt<startAt+900||endAt>startAt+8*3600)throw new Error("The event must last between 15 minutes and 8 hours.");
  if(d.description.length>700||d.location.length>120)throw new Error("Shorten the description or location.");
  if(d.website){try{if(new URL(d.website).protocol!=="https:")throw new Error();}catch{throw new Error("Enter an event information link that starts with https://.");}}
  if(!/^\d{1,20}$/.test(d.parentRound))throw new Error("The event reference being copied is invalid.");
  const parentRound=BigInt(d.parentRound);
  if(parentRound>2n**64n-1n)throw new Error("The event reference being copied is invalid.");
  const metadata=JSON.stringify({title:d.title.trim(),description:d.description.trim(),category:d.category,format:d.format,location:d.location.trim(),website:d.website.trim()});
  if(new TextEncoder().encode(metadata).length>1800)throw new Error("Shorten the event details before publishing.");
  return {price,minimum:d.minimum,capacity:d.capacity,deadline,startAt,endAt,parentRound,metadata};
}
export function localDateInput(seconds:number):string {
  const date=new Date(seconds*1000);
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
export function defaultDraft(now:number):Draft {
  return {title:"",description:"",category:"Workshop",format:"online",location:"",website:"",price:"5",minimum:3,capacity:8,
    deadline:localDateInput(now+2*86400),startAt:localDateInput(now+3*86400),endAt:localDateInput(now+3*86400+3600),parentRound:"0"};
}
export function repeatDraft(s:Session,now:number):Draft {
  const start=Math.max(s.startAt+7*86400,now+3*86400),deadline=start-86400;
  return {...s.metadata,price:formatWif(s.price),minimum:s.minimum,capacity:s.capacity,deadline:localDateInput(deadline),startAt:localDateInput(start),
    endAt:localDateInput(start+s.endAt-s.startAt),parentRound:s.example?"0":s.id.toString()};
}
const calendarEscape=(text:string)=>text.replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
const utc=(seconds:number)=>new Date(seconds*1000).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/, "Z");
function foldedLine(line:string):string {
  const encoder=new TextEncoder();let result="",current="",length=0;
  for(const char of line){const size=encoder.encode(char).length;if(length+size>73){result+=current+"\r\n ";current="";length=1;}current+=char;length+=size;}
  return result+current;
}
export function calendar(s:Session,now:number,link:string):string {
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Rally//Community Sessions//EN","CALSCALE:GREGORIAN","BEGIN:VEVENT",
    `UID:${s.example?"example-":""}${s.id}@rally-wif`,`DTSTAMP:${utc(now)}`,`DTSTART:${utc(s.startAt)}`,`DTEND:${utc(s.endAt)}`,
    `SUMMARY:${calendarEscape((s.example?"Example: ":"")+s.metadata.title)}`,`DESCRIPTION:${calendarEscape(s.metadata.description+"\nBooking status: "+effectivePhase(s,now)+"\n"+link)}`,
    `LOCATION:${calendarEscape(s.metadata.location||s.metadata.format)}`,"END:VEVENT","END:VCALENDAR"];
  return lines.map(foldedLine).join("\r\n")+"\r\n";
}
