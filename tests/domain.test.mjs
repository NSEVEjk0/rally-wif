import test from "node:test";
import assert from "node:assert/strict";
import {parseWif,formatWif,bondFor,completionAmounts,effectivePhase,refundable,checkInAvailable,calendar,readMeta,draftTerms,defaultDraft,repeatDraft} from "../src/domain.ts";

const now=1793836800;
const meta={title:"Build, together",description:"A community session",category:"Workshop",format:"online",location:"Online",website:""};
const round={id:1n,creator:"0xhost",price:parseWif("5"),bond:bondFor(parseWif("5"),3),bonusPerSeat:0n,minimum:3,capacity:8,seats:2,refunds:0,
  deadline:now+3600,startAt:now+7200,endAt:now+10800,parentRound:0n,phase:"funding",checkedIn:false,termsHash:"",metadata:meta,example:true};

test("WIF amount input preserves 18 decimal places and rejects rounding or exponent forms",()=>{
 assert.equal(formatWif(parseWif("0.000000000000000001")),"0.000000000000000001");
 assert.equal(formatWif(parseWif("999999.123456789123456789")),"999999.123456789123456789");
 for(const text of ["0","-1","1e4","01","1.0000000000000000001","1000001","NaN"])assert.throws(()=>parseWif(text));
});
test("cutoff and missed-check-in edges match published terms",()=>{
 assert.equal(effectivePhase(round,round.deadline-1),"funding");
 assert.equal(effectivePhase(round,round.deadline),"underfilled");
 assert.equal(refundable(round,true,round.deadline),round.price);
 const ready={...round,seats:3};
 assert.equal(effectivePhase(ready,ready.startAt+900),"confirmed");
 assert.equal(checkInAvailable(ready,ready.startAt+900),true);
 assert.equal(effectivePhase(ready,ready.startAt+901),"missed");
 assert.equal(refundable(ready,true,ready.startAt+901),parseWif("7.5"));
 assert.equal(refundable(ready,false,ready.startAt+901),0n);
});
test("completion and cancellation accounting preserves WIF to the wei",()=>{
 const amounts=completionAmounts(5n,3,7n);
 assert.deepEqual(amounts,{gross:15n,sink:0n,creator:22n});
 assert.equal(refundable({...round,price:5n,bond:7n,bonusPerSeat:2n,phase:"cancelled"},true,now),7n);
});
test("form validates current dates, capacity, protocol and metadata bounds",()=>{
 const d={...defaultDraft(now),title:"Community workshop"};
 assert.equal(draftTerms(d,now).price,parseWif("5"));
 assert.throws(()=>draftTerms({...d,minimum:1},now));
 assert.throws(()=>draftTerms({...d,capacity:101},now));
 assert.throws(()=>draftTerms({...d,website:"javascript:alert(1)"},now));
 assert.throws(()=>draftTerms({...d,deadline:""},now));
});
test("untrusted metadata excludes active URL protocols and gives a readable fallback",()=>{
 assert.equal(readMeta(JSON.stringify({...meta,website:"javascript:alert(1)"})).website,"");
 assert.equal(readMeta("not json").title,"Community session");
});
test("repeat is a new draft and calendar output escapes content and uses UTC",()=>{
 const d=repeatDraft({...round,example:false},now);
 assert.equal(d.parentRound,"1");assert.ok(draftTerms(d,now).startAt>round.startAt);
 const output=calendar({...round,metadata:{...meta,title:"Meet; learn,\nnext"}},now,"https://rally.example");
 assert.match(output,/SUMMARY:Example: Meet\\; learn\\,\\nnext/);
 assert.match(output,/DTSTART:\d{8}T\d{6}Z/);
 assert.ok(output.endsWith("END:VCALENDAR\r\n"));
});
