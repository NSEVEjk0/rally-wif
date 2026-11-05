import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createPublicClient,createWalletClient,http,defineChain,keccak256} from "viem";
const url="http://127.0.0.1:8545";
const network=defineChain({id:4663,name:"Isolated Rally test chain",nativeCurrency:{name:"Test ether",symbol:"ETH",decimals:18},rpcUrls:{default:{http:[url]}}});
const publicClient=createPublicClient({chain:network,transport:http(url)});
if(await publicClient.getChainId()!==4663)throw new Error("Wrong isolated test chain.");
const accounts=await publicClient.request({method:"eth_accounts"});
const wallet=createWalletClient({account:accounts[0],chain:network,transport:http(url)});
const artifact=JSON.parse(await readFile(new URL("../contracts/out/Rally.sol/Rally.json",import.meta.url),"utf8"));
const mock=JSON.parse(await readFile(new URL("../contracts/out/Rally.t.sol/MockWIF.json",import.meta.url),"utf8"));
const token="0x5173b8eA6923c2d40267890D45C46a3480954773";
await publicClient.request({method:"anvil_setCode",params:[token,mock.deployedBytecode.object]});
const hash=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode.object});
const receipt=await publicClient.waitForTransactionReceipt({hash});
for(const account of accounts.slice(0,3)){
  const mint=await wallet.writeContract({address:token,abi:mock.abi,functionName:"mint",args:[account,1000n*10n**18n]});
  await publicClient.waitForTransactionReceipt({hash:mint});
}
const config={chainId:4663,token,contract:receipt.contractAddress,runtimeCodeHash:keccak256(await publicClient.getCode({address:receipt.contractAddress})),
  deployBlock:Number(receipt.blockNumber),transactionHash:hash,compiler:"0.8.30",optimizerRuns:200,feeBps:100,checkInGraceSeconds:900};
await writeFile(new URL("../src/deployment.json",import.meta.url),JSON.stringify(config)+"\n");
await mkdir(new URL("../.local/",import.meta.url),{recursive:true});
await writeFile(new URL("../.local/test-accounts.json",import.meta.url),JSON.stringify(accounts.slice(0,3)));
console.log("Isolated chain configured with mock WIF; no mainnet transaction occurred.");
