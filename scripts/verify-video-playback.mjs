import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';

// Read-only playback verification. No wallet, contract transaction or repair job.
const out=resolve(import.meta.dirname,'../reports/playback');
await mkdir(out,{recursive:true});
const pages=[['rally-slash','https://rally-wif.vercel.app/demo/'],['rally-no-slash','https://rally-wif.vercel.app/demo']];
if(process.argv.includes('--with-reprolab'))pages.push(['reprolab','https://reprolab-ckay.vercel.app/demo/'],['reprolab-no-slash','https://reprolab-ckay.vercel.app/demo']);
const browser=await chromium.launch({headless:true});
const results=[];
try{
  for(const [name,url] of pages){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const page=await context.newPage();
    try{
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:30_000});
      await page.locator('video').waitFor({state:'visible',timeout:10_000});
      await page.waitForFunction(()=>{const video=document.querySelector('video');return video.error||video.readyState>=1;},{},{timeout:20_000});
      let state=await page.locator('video').evaluate(video=>({page:location.href,source:video.currentSrc,duration:video.duration,width:video.videoWidth,height:video.videoHeight,error:video.error?{code:video.error.code,message:video.error.message}:null,canPlayMP4:video.canPlayType('video/mp4; codecs="avc1.42E028,mp4a.40.2"')}));
      assert.equal(state.error,null,'Browser must decode the public video');
      assert.ok(state.duration>40&&state.duration<=55,'Public video duration must remain below 55 seconds');
      assert.ok(state.width>0&&state.height>0,'Actual decoded video dimensions are required');
      if(await page.locator('#play-demo').count())await page.locator('#play-demo').click();
      else await page.locator('video').evaluate(async video=>{video.muted=true;await video.play();});
      await page.waitForFunction(()=>{const video=document.querySelector('video');return video.currentTime>1&&!video.paused&&video.readyState>=2;},{},{timeout:15_000});
      state={...state,...await page.locator('video').evaluate(video=>({currentTime:video.currentTime,frames:video.getVideoPlaybackQuality().totalVideoFrames,audioDecodedBytes:video.webkitAudioDecodedByteCount||0}))};
      assert.ok(state.frames>0,'Frames must actually play');
      if(process.argv.includes('--require-audio'))assert.ok(state.audioDecodedBytes>0,'The browser must decode spoken audio');
      await page.locator('video').scrollIntoViewIfNeeded();
      await page.screenshot({path:resolve(out,`${name}.png`)});
      results.push({name,passed:true,...state});
    }catch(error){
      const state=await page.locator('video').evaluate(video=>({page:location.href,source:video.currentSrc,duration:video.duration,error:video.error?{code:video.error.code,message:video.error.message}:null})).catch(()=>({page:page.url()}));
      await page.screenshot({path:resolve(out,`${name}-failed.png`)}).catch(()=>{});
      results.push({name,passed:false,...state,message:error.message});
    }finally{await context.close();}
  }
}finally{await browser.close();}
await writeFile(resolve(out,'verification.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results));
assert.ok(results.every(result=>result.passed),'Every published demo URL must play');
