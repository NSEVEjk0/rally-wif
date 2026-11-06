import {parseWif,bondFor,type Session} from "./domain.ts";
export function examples(now:number):Session[]{
  return [
    {title:"Build a simple website",description:"A one-hour online workshop. Bring a laptop, build a small website and get help when you are stuck.",category:"Workshop",price:"5",minimum:5,capacity:10,seats:3,location:"Online · bring your laptop",format:"online" as const},
    {title:"Get feedback on your project",description:"Show your project to a small group. Each participant gives one suggestion. This online feedback session lasts one hour.",category:"Feedback circle",price:"8",minimum:3,capacity:6,seats:3,location:"Online · one-hour feedback session",format:"online" as const},
    {title:"Coffee and a design meetup",description:"An in-person design meetup at a fictional community cafe. Bring a sketch or website and discuss it with other designers.",category:"Meetup",price:"6",minimum:4,capacity:8,seats:1,location:"Example venue · community cafe",format:"in-person" as const},
  ].map((m,i)=>{
    const price=parseWif(m.price),deadline=now+(i+1)*86400,startAt=deadline+86400;
    return {id:BigInt(i+1),creator:"example-host",price,bond:bondFor(price,m.minimum),bonusPerSeat:0n,minimum:m.minimum,capacity:m.capacity,seats:m.seats,refunds:0,
      deadline,startAt,endAt:startAt+3600,parentRound:0n,phase:"funding",checkedIn:false,termsHash:"Example terms · no onchain commitment",example:true,
      metadata:{title:m.title,description:m.description,category:m.category,format:m.format,location:m.location,website:""}};
  });
}
