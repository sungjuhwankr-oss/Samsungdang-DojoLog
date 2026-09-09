import assert from "node:assert/strict";
import test from "node:test";
import {compositionVideoActions,launchVideoUrl,shouldLaunchVideo,videoActions} from "../app/video-links";

const omote={label:"오모테",url:"https://youtu.be/example?t=1"};
const ura={label:"우라",url:"https://www.youtube.com/watch?v=example&t=2"};

test("returns separate omote and ura actions without duplicating labels",()=>{
 assert.deepEqual(videoActions([omote,ura,omote]),[
  {kind:"omote",label:"영상(오모테)",url:omote.url},
  {kind:"ura",label:"영상(우라)",url:ura.url}
 ]);
});

test("handles omote-only and ura-only links",()=>{
 assert.deepEqual(videoActions([omote]),[{kind:"omote",label:"영상(오모테)",url:omote.url}]);
 assert.deepEqual(videoActions([ura]),[{kind:"ura",label:"영상(우라)",url:ura.url}]);
});

test("uses one generic action for a single unlabeled or legacy-numbered link",()=>{
 const generic={url:"https://youtu.be/generic"};
 const numbered={label:"1",url:"https://youtu.be/numbered"};
 assert.deepEqual(videoActions([generic]),[{kind:"generic",label:"영상",url:generic.url}]);
 assert.deepEqual(videoActions([numbered]),[{kind:"generic",label:"영상",url:numbered.url}]);
});

test("keeps multiple generic videos available without inventing omote or ura labels",()=>{
 const first={label:"1",url:"https://youtu.be/generic?t=1"};
 const second={label:"2",url:"https://youtu.be/generic?t=2"};
 assert.deepEqual(videoActions([first,second]),[
  {kind:"generic-1",label:"영상 1",url:first.url},
  {kind:"generic-2",label:"영상 2",url:second.url}
 ]);
});

test("omits invalid and absent video links",()=>{
 assert.deepEqual(videoActions([]),[]);
 assert.deepEqual(videoActions([{label:"오모테",url:"http://example.com/video"}]),[]);
});

test("uses compact semantic labels only in class composition",()=>{
 assert.deepEqual(compositionVideoActions([omote,ura]),[
  {kind:"omote",label:"오모테",url:omote.url},
  {kind:"ura",label:"우라",url:ura.url}
 ]);
 const first={label:"1",url:"https://youtu.be/generic?t=1"};
 const second={label:"2",url:"https://youtu.be/generic?t=2"};
 assert.deepEqual(compositionVideoActions([first,second]),[
  {kind:"generic-1",label:"영상 1",url:first.url},
  {kind:"generic-2",label:"영상 2",url:second.url}
 ]);
});

test("uses one native external handoff for semantic and generic video URLs",()=>{
 const opened:string[]=[];
 const assigned:string[]=[];
 const host={SamsungdangBackupBridge:{openExternalUrl:(url:string)=>opened.push(url)},location:{assign:(url:string)=>assigned.push(url)}};
 for(const action of [...compositionVideoActions([omote,ura]),...compositionVideoActions([{url:"https://youtu.be/generic"}])]){
  assert.equal(launchVideoUrl(host,action.url),"native");
 }
 assert.deepEqual(opened,[omote.url,ura.url,"https://youtu.be/generic"]);
 assert.deepEqual(assigned,[]);
});

test("uses exactly one browser navigation when the native bridge is absent",()=>{
 const assigned:string[]=[];
 const host={location:{assign:(url:string)=>assigned.push(url)}};
 assert.equal(launchVideoUrl(host,omote.url),"web");
 assert.deepEqual(assigned,[omote.url]);
});

test("suppresses only a rapid duplicate tap without blocking a later retry",()=>{
 const last={url:omote.url,at:1000};
 assert.equal(shouldLaunchVideo(last,omote.url,1500),false);
 assert.equal(shouldLaunchVideo(last,omote.url,1800),true);
 assert.equal(shouldLaunchVideo(last,ura.url,1100),true);
});
