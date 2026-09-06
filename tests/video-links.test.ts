import assert from "node:assert/strict";
import test from "node:test";
import {videoActions} from "../app/video-links";

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
