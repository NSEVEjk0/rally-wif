import {createPublicClient,createWalletClient,custom,http,defineChain,keccak256,zeroAddress,type Abi,type Address,type Hash,type EIP1193Provider} from "viem";
import config from "./deployment.json";
import rawAbi from "./abi.json";
import {CHAIN_ID,WIF,readMeta,type Session,type Terms} from "./domain.ts";

export const explorer="https://robinhoodchain.blockscout.com";
export const network=defineChain({id:CHAIN_ID,name:"Robinhood Chain",nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18},
  rpcUrls:{default:{http:["https://rpc.mainnet.chain.robinhood.com"]}},blockExplorers:{default:{name:"Blockscout",url:explorer}}});
const client=createPublicClient({chain:network,transport:http(undefined,{timeout:12_000,retryCount:1})});
const abi=rawAbi as Abi;
const tokenAbi=[
  {type:"function",name:"approve",stateMutability:"nonpayable",inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}],outputs:[{type:"bool"}]},
  {type:"function",name:"allowance",stateMutability:"view",inputs:[{name:"owner",type:"address"},{name:"spender",type:"address"}],outputs:[{type:"uint256"}]},
  {type:"function",name:"balanceOf",stateMutability:"view",inputs:[{name:"owner",type:"address"}],outputs:[{type:"uint256"}]},
] as const;
type RawRound={creator:Address;price:bigint;bond:bigint;bonusPerSeat:bigint;minimum:number;capacity:number;seats:number;refunds:number;
  deadline:bigint;startAt:bigint;endAt:bigint;parentRound:bigint;phase:number;checkedIn:boolean;termsHash:Hash;metadata:string};
type WindowWallet=Window&{ethereum?:EIP1193Provider&{on?:(event:string,cb:()=>void)=>void}};
export function deployed():boolean {return Boolean(config.contract&&config.runtimeCodeHash&&config.deployBlock!==null);}
export function contractAddress():Address {
  if(!deployed()||config.chainId!==CHAIN_ID||config.token.toLowerCase()!==WIF.toLowerCase())throw new Error("Rally’s WIF contract deployment is awaiting the funded operator wallet.");
  const address=config.contract as string|null;
  if(!address)throw new Error("Rally’s contract is awaiting deployment.");
  return address as Address;
}
let verified=false;
export async function verifyContract():Promise<void> {
  if(verified)return;
  const address=contractAddress();
  if(await client.getChainId()!==CHAIN_ID)throw new Error("The read connection is on a different chain.");
  const code=await client.getCode({address});
  if(!code||keccak256(code)!==config.runtimeCodeHash)throw new Error("The deployed contract does not match Rally’s pinned runtime code.");
  verified=true;
}
export async function sessions(wanted?:bigint):Promise<Session[]> {
  await verifyContract();
  const address=contractAddress();
  const next=await client.readContract({address,abi,functionName:"nextRoundId"}) as bigint;
  const ids:bigint[]=[];
  for(let id=next-1n;id>0n&&ids.length<30;id--)ids.push(id);
  if(wanted&&wanted>0n&&wanted<next&&!ids.includes(wanted))ids.push(wanted);
  const result:Session[]=[];
  for(let i=0;i<ids.length;i+=4){
    const reads=await Promise.all(ids.slice(i,i+4).map(async id=>{
      const r=await client.readContract({address,abi,functionName:"getRound",args:[id]}) as RawRound;
      const phases=["funding","confirmed","completed","underfilled","cancelled","missed"] as const;
      return {...r,id,deadline:Number(r.deadline),startAt:Number(r.startAt),endAt:Number(r.endAt),phase:phases[r.phase],metadata:readMeta(r.metadata),example:false};
    }));result.push(...reads);
  }
  return result;
}
export async function accountDetails(owner:Address,ids:bigint[]) {
  const address=contractAddress();
  const [balance,credit,stats]=await Promise.all([
    client.readContract({address:WIF,abi:tokenAbi,functionName:"balanceOf",args:[owner]}),
    client.readContract({address,abi,functionName:"credits",args:[owner]}) as Promise<bigint>,
    client.readContract({address,abi,functionName:"creatorStats",args:[owner]}) as Promise<readonly bigint[]>
  ]);
  const reserved=new Set<string>();
  for(let i=0;i<ids.length;i+=4)await Promise.all(ids.slice(i,i+4).map(async id=>{
    const has=await client.readContract({address,abi,functionName:"reserved",args:[id,owner]});
    if(has)reserved.add(id.toString());
  }));
  return {balance,credit,stats,reserved};
}
let connected:Address|undefined;
export function account():Address|undefined{return connected;}
function provider(){const p=(window as WindowWallet).ethereum;if(!p)throw new Error("Open Rally in a wallet browser, or use an Ethereum-compatible wallet extension.");return p;}
export async function connect():Promise<Address> {
  const wallet=createWalletClient({chain:network,transport:custom(provider())});
  const addresses=await wallet.requestAddresses();
  if(!addresses[0]||addresses[0]===zeroAddress)throw new Error("No wallet address was selected.");
  connected=addresses[0];return connected;
}
export function watchWallet(callback:()=>void){
  const p=(window as WindowWallet).ethereum;
  p?.on?.("accountsChanged",()=>{connected=undefined;callback();});p?.on?.("chainChanged",()=>{connected=undefined;callback();});
}
export type Progress=(message:string)=>void;
async function walletReady(){
  if(!connected)await connect();
  const owner=connected!;
  const wallet=createWalletClient({account:owner,chain:network,transport:custom(provider())});
  if(await wallet.getChainId()!==CHAIN_ID){
    try{await wallet.switchChain({id:CHAIN_ID});}
    catch(error){
      const code=(error as {code?:number;cause?:{code?:number}}).code??(error as {cause?:{code?:number}}).cause?.code;
      if(code!==4902)throw error;
      await wallet.addChain({chain:network});await wallet.switchChain({id:CHAIN_ID});
    }
  }
  await verifyContract();return {wallet,owner};
}
async function allowance(amount:bigint,progress:Progress){
  const {wallet,owner}=await walletReady();const address=contractAddress();
  const existing=await client.readContract({address:WIF,abi:tokenAbi,functionName:"allowance",args:[owner,address]});
  if(existing<amount){
    progress("Review the exact WIF allowance in your wallet.");
    const hash=await wallet.writeContract({address:WIF,abi:tokenAbi,functionName:"approve",args:[address,amount]});
    progress("Waiting for the allowance transaction.");
    const receipt=await client.waitForTransactionReceipt({hash,timeout:60_000});
    if(receipt.status!=="success")throw new Error("The WIF allowance did not succeed.");
  }
  return {wallet,owner,address};
}
async function included(hash:Hash,progress:Progress){
  progress("Waiting for the transaction to be included.");
  const receipt=await client.waitForTransactionReceipt({hash,timeout:60_000});
  if(receipt.status!=="success")throw new Error("The transaction reverted. Refresh the session before trying again.");
  return {hash,block:receipt.blockNumber,logs:receipt.logs};
}
export async function createSession(terms:Terms,progress:Progress){
  const bond=terms.price*BigInt(terms.minimum)/2n;
  const {wallet,address}=await allowance(bond,progress);
  progress("Review the fixed session terms and creator bond in your wallet.");
  const hash=await wallet.writeContract({address,abi,functionName:"createRound",args:[{...terms,deadline:BigInt(terms.deadline),startAt:BigInt(terms.startAt),endAt:BigInt(terms.endAt)}]});
  const result=await included(hash,progress);
  const topic=keccak256(new TextEncoder().encode("RoundCreated(uint64,address,uint64,bytes32,uint256)"));
  const idTopic=result.logs.find(log=>log.address.toLowerCase()===address.toLowerCase()&&log.topics[0]===topic)?.topics[1];
  return {...result,id:idTopic?BigInt(idTopic):undefined};
}
export async function reserveSession(s:Session,progress:Progress){
  const {wallet,address}=await allowance(s.price,progress);
  progress("Confirm your WIF reservation in the wallet.");
  return included(await wallet.writeContract({address,abi,functionName:"reserve",args:[s.id]}),progress);
}
export async function sessionAction(name:"leave"|"refund"|"resolve"|"cancel"|"complete"|"checkIn"|"claimCredit"|"resolveMissedCheckIn",id:bigint|undefined,progress:Progress){
  const {wallet}=await walletReady();progress("Review the session action in your wallet.");
  const args=name==="claimCredit"?[]:name==="checkIn"?[id,keccak256(new TextEncoder().encode("Rally host check-in"))]:[id];
  return included(await wallet.writeContract({address:contractAddress(),abi,functionName:name,args}),progress);
}
