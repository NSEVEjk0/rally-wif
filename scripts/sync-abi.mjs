import {readFile,writeFile} from "node:fs/promises";
const artifact=JSON.parse(await readFile(new URL("../contracts/out/Rally.sol/Rally.json",import.meta.url),"utf8"));
const text=JSON.stringify(artifact.abi,null,2)+"\n";
const target=new URL("../src/abi.json",import.meta.url);
if(process.argv.includes("--check")){
  if(await readFile(target,"utf8")!==text)throw new Error("Committed ABI differs from the compiled contract.");
  console.log("Compiled and committed Rally ABI match.");
}else{await writeFile(target,text);console.log("Rally ABI written from compiler artifact.");}
