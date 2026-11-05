import {parseWif,bondFor,type Session} from "./domain.ts";
export function examples(now:number):Session[]{
  return [
    {title:"Build night: from idea to onchain",description:"Bring one small idea. Leave with a page you can share. A focused build session, with time to help each other get unstuck.",category:"Workshop",price:"5",minimum:5,capacity:10,seats:3,location:"Online · bring your laptop",format:"online" as const},
    {title:"Your next launch, better together",description:"A small feedback circle for founders and makers. Share your next launch, ask for a second pair of eyes and make one useful introduction.",category:"Feedback circle",price:"8",minimum:3,capacity:6,seats:3,location:"Online · 60-minute circle",format:"online" as const},
    {title:"Coffee, sketches & a fresh perspective",description:"An informal design workshop for the WIF community. Bring something you are working on and spend a morning building on each other's ideas.",category:"Meetup",price:"6",minimum:4,capacity:8,seats:1,location:"Example venue · community cafe",format:"in-person" as const},
  ].map((m,i)=>{
    const price=parseWif(m.price),deadline=now+(i+1)*86400,startAt=deadline+86400;
    return {id:BigInt(i+1),creator:"example-host",price,bond:bondFor(price,m.minimum),bonusPerSeat:0n,minimum:m.minimum,capacity:m.capacity,seats:m.seats,refunds:0,
      deadline,startAt,endAt:startAt+3600,parentRound:0n,phase:"funding",checkedIn:false,termsHash:"Example terms · no onchain commitment",example:true,
      metadata:{title:m.title,description:m.description,category:m.category,format:m.format,location:m.location,website:""}};
  });
}
