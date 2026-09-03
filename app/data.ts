export type Grade = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type VideoLink = { label?: string; url: string };
export type Kata = { id:string; name:string; form:"입기"|"좌기"|"반신반립"; attack:string; technique:string; grade?:Grade; hombu:boolean; exam:boolean; area:"일반 체술"|"호흡력"|"다인 잡기"|"무기 잡기"; links:VideoLink[] };

export const EXAM_GROUPS: Record<Grade,{sessions:number;focus:string;basics?:string[];kata:string[]}> = {
  9:{sessions:10,focus:"구석던지기·호흡던지기",basics:["후방낙법","측방회전낙법","전방회전낙법","반신(좌·우)","맞서기·엇서기","입신·전환·회전·전회","전환법"],kata:["엇서한손잡기 구석던지기","엇서한손잡기 호흡던지기"]},
  8:{sessions:10,focus:"기초 체술",basics:["무릎걸음","좌기 호흡법"],kata:["맞서한손잡기 입신던지기","맞서한손잡기 손목뒤집기","맞서한손잡기 1교","엇서한손잡기 사방던지기"]},
  7:{sessions:20,focus:"1교",kata:["정면타 1교","어깨잡기 1교","횡면타 1교","뒤양손잡기 1교","좌기 정면타 1교"]},
  6:{sessions:20,focus:"입신던지기·천지던지기",kata:["정면타 입신던지기","횡면타 입신던지기","찌르기 입신던지기","맞서한손잡기 입신던지기","엇서한손잡기 입신던지기","양손잡기 입신던지기","한손양손잡기 입신던지기","뒤양손잡기 입신던지기","양손잡기 천지던지기"]},
  5:{sessions:20,focus:"사방던지기·손목뒤집기",kata:["엇서한손잡기 사방던지기","횡면타 사방던지기","양손잡기 사방던지기","뒤양손잡기 사방던지기","반신반립 엇서한손잡기 사방던지기","반신반립 양손잡기 사방던지기","찌르기 손목뒤집기","엇서한손잡기 손목뒤집기","정면타 손목뒤집기","횡면타 손목뒤집기","한손양손잡기 손목뒤집기","뒤양손잡기 손목뒤집기"]},
  4:{sessions:30,focus:"2교·외회전던지기",kata:["엇서한손잡기 2교","맞서한손잡기 2교","어깨잡기 2교","한손양손잡기 2교","좌기 정면타 2교","엇서한손잡기 외회전던지기","정면타 외회전던지기","찌르기 외회전던지기"]},
  3:{sessions:30,focus:"3교·내회전던지기",kata:["정면타 3교","횡면타 3교","엇서한손잡기 3교","뒤양손잡기 3교","엇서한손잡기 내회전던지기","뒤양손잡기 내회전던지기"]},
  2:{sessions:40,focus:"4교·5교·호흡법",kata:["횡면타 4교","어깨잡기 4교","양손잡기 4교","뒤양손잡기 4교","좌기 정면타 4교","횡면타 5교","좌기 정면타 5교","한손양손잡기 호흡법"]},
  1:{sessions:40,focus:"허리던지기·합기떨어뜨리기·십자던지기",kata:["뒤양손잡기 허리던지기","양손잡기 허리던지기","양어깨잡기 합기떨어뜨리기","뒤양손잡기 합기떨어뜨리기","한손양손잡기 십자던지기","뒤양손잡기 십자던지기","뒤양어깨잡기 십자던지기"]}
};

const VIDEO_TEXT=`
좌기 호흡법|https://youtu.be/HmTnMlx5GrA?t=1362
한손양손잡기 호흡법|오모테|https://youtu.be/HmTnMlx5GrA?t=1390
한손양손잡기 호흡법|우라|https://youtu.be/HmTnMlx5GrA?t=1429
맞서한손잡기 1교|오모테|https://youtu.be/HmTnMlx5GrA?t=1151
맞서한손잡기 1교|우라|https://youtu.be/HmTnMlx5GrA?t=1201
정면타 1교|오모테|https://youtu.be/HmTnMlx5GrA?t=1250
정면타 1교|우라|https://youtu.be/HmTnMlx5GrA?t=1285
좌기 정면타 1교|오모테|https://youtu.be/u_7Mgi_VnaE?t=132
좌기 정면타 1교|우라|https://youtu.be/u_7Mgi_VnaE?t=195
횡면타 1교|오모테|https://youtu.be/u_7Mgi_VnaE?t=258
횡면타 1교|우라|https://youtu.be/u_7Mgi_VnaE?t=324
어깨잡기 1교|오모테|https://youtu.be/u_7Mgi_VnaE?t=386
어깨잡기 1교|우라|https://youtu.be/u_7Mgi_VnaE?t=456
뒤양손잡기 1교|오모테|https://youtu.be/u_7Mgi_VnaE?t=510
뒤양손잡기 1교|우라|https://youtu.be/u_7Mgi_VnaE?t=590
좌기 정면타 2교|오모테|https://youtu.be/u_7Mgi_VnaE?t=694
좌기 정면타 2교|우라|https://youtu.be/u_7Mgi_VnaE?t=756
엇서한손잡기 2교|오모테|https://youtu.be/u_7Mgi_VnaE?t=811
엇서한손잡기 2교|우라|https://youtu.be/u_7Mgi_VnaE?t=896
어깨잡기 2교|오모테|https://youtu.be/u_7Mgi_VnaE?t=966
어깨잡기 2교|우라|https://youtu.be/u_7Mgi_VnaE?t=1026
한손양손잡기 2교|오모테|https://youtu.be/u_7Mgi_VnaE?t=1096
한손양손잡기 2교|우라|https://youtu.be/u_7Mgi_VnaE?t=1186
맞서한손잡기에서 바로 넣는 2교|https://youtu.be/u_7Mgi_VnaE?t=1247
정면타 3교|오모테|https://youtu.be/XJIeNPFzw2Y?t=115
정면타 3교|우라|https://youtu.be/XJIeNPFzw2Y?t=205
엇서한손잡기 3교|오모테|https://youtu.be/XJIeNPFzw2Y?t=270
엇서한손잡기 3교|우라|https://youtu.be/XJIeNPFzw2Y?t=340
횡면타 3교|오모테|https://youtu.be/XJIeNPFzw2Y?t=400
횡면타 3교|우라|https://youtu.be/XJIeNPFzw2Y?t=473
뒤양손잡기 3교|오모테|https://youtu.be/XJIeNPFzw2Y?t=548
뒤양손잡기 3교|우라|https://youtu.be/XJIeNPFzw2Y?t=618
좌기 정면타 4교|오모테|https://youtu.be/XJIeNPFzw2Y?t=748
좌기 정면타 4교|우라|https://youtu.be/XJIeNPFzw2Y?t=823
횡면타 4교|오모테|https://youtu.be/XJIeNPFzw2Y?t=878
횡면타 4교|우라|https://youtu.be/XJIeNPFzw2Y?t=933
어깨잡기 4교|오모테|https://youtu.be/XJIeNPFzw2Y?t=983
어깨잡기 4교|우라|https://youtu.be/XJIeNPFzw2Y?t=1033
양손잡기 4교|오모테|https://youtu.be/XJIeNPFzw2Y?t=1088
양손잡기 4교|우라|https://youtu.be/XJIeNPFzw2Y?t=1133
뒤양손잡기 4교|오모테|https://youtu.be/XJIeNPFzw2Y?t=1183
뒤양손잡기 4교|우라|https://youtu.be/XJIeNPFzw2Y?t=1240
좌기 정면타 5교|오모테|https://youtu.be/XJIeNPFzw2Y?t=1351
좌기 정면타 5교|우라|https://youtu.be/XJIeNPFzw2Y?t=1424
횡면타 5교|오모테|https://youtu.be/XJIeNPFzw2Y?t=1478
횡면타 5교|우라|https://youtu.be/XJIeNPFzw2Y?t=1528
정면타 입신던지기|https://youtu.be/19vFET0GM1g?t=116
횡면타 입신던지기|https://youtu.be/19vFET0GM1g?t=187
맞서한손잡기 입신던지기|https://youtu.be/19vFET0GM1g?t=277
엇서한손잡기 입신던지기|https://youtu.be/19vFET0GM1g?t=348
양손잡기 입신던지기|https://youtu.be/19vFET0GM1g?t=422
한손양손잡기 입신던지기|https://youtu.be/19vFET0GM1g?t=488
찌르기 입신던지기|https://youtu.be/19vFET0GM1g?t=558
뒤양손잡기 입신던지기|https://youtu.be/19vFET0GM1g?t=628
엇서한손잡기 사방던지기|오모테|https://youtu.be/HmTnMlx5GrA?t=1041
엇서한손잡기 사방던지기|우라|https://youtu.be/HmTnMlx5GrA?t=1111
횡면타 사방던지기|오모테|https://youtu.be/19vFET0GM1g?t=768
횡면타 사방던지기|우라|https://youtu.be/19vFET0GM1g?t=833
반신반립 엇서한손잡기 사방던지기|오모테|https://youtu.be/19vFET0GM1g?t=903
반신반립 엇서한손잡기 사방던지기|우라|https://youtu.be/19vFET0GM1g?t=983
반신반립 양손잡기 사방던지기|오모테|https://youtu.be/19vFET0GM1g?t=1033
반신반립 양손잡기 사방던지기|우라|https://youtu.be/19vFET0GM1g?t=1123
양손잡기 사방던지기|오모테|https://youtu.be/19vFET0GM1g?t=1178
양손잡기 사방던지기|우라|https://youtu.be/19vFET0GM1g?t=1243
뒤양손잡기 사방던지기|오모테|https://youtu.be/19vFET0GM1g?t=1298
뒤양손잡기 사방던지기|우라|https://youtu.be/19vFET0GM1g?t=1368
찌르기 손목뒤집기|1|https://youtu.be/dQTPeYz_qXU?t=111
찌르기 손목뒤집기|2|https://youtu.be/dQTPeYz_qXU?t=226
엇서한손잡기 손목뒤집기|https://youtu.be/dQTPeYz_qXU?t=303
정면타 손목뒤집기|https://youtu.be/dQTPeYz_qXU?t=408
횡면타 손목뒤집기|https://youtu.be/dQTPeYz_qXU?t=503
한손양손잡기 손목뒤집기|https://youtu.be/dQTPeYz_qXU?t=625
뒤양손잡기 손목뒤집기|https://youtu.be/dQTPeYz_qXU?t=745
엇서한손잡기 내회전던지기|https://youtu.be/dQTPeYz_qXU?t=885
엇서한손잡기 외회전던지기|https://youtu.be/dQTPeYz_qXU?t=970
정면타 외회전던지기|https://youtu.be/dQTPeYz_qXU?t=1085
찌르기 외회전던지기|https://youtu.be/dQTPeYz_qXU?t=1190
뒤양손잡기 내회전던지기|https://youtu.be/dQTPeYz_qXU?t=1270
양손잡기 천지던지기|오모테|https://youtu.be/dQTPeYz_qXU?t=1400
양손잡기 천지던지기|우라|https://youtu.be/dQTPeYz_qXU?t=1465
양손잡기 허리던지기|1|https://youtu.be/K79c41m2SIQ?t=132
양손잡기 허리던지기|2|https://youtu.be/K79c41m2SIQ?t=218
뒤양손잡기 허리던지기|https://youtu.be/K79c41m2SIQ?t=285
한손양손잡기 호흡던지기|https://youtu.be/K79c41m2SIQ?t=393
횡면타 호흡던지기|https://youtu.be/K79c41m2SIQ?t=473
뒤양손잡기 호흡던지기|https://youtu.be/K79c41m2SIQ?t=568
한손양손잡기 십자던지기|https://youtu.be/K79c41m2SIQ?t=659
뒤양손잡기 십자던지기|https://youtu.be/K79c41m2SIQ?t=760
뒤양어깨잡기 십자던지기|https://youtu.be/K79c41m2SIQ?t=868
양어깨잡기 합기떨어뜨리기|https://youtu.be/K79c41m2SIQ?t=916
뒤양손잡기 합기떨어뜨리기|https://youtu.be/K79c41m2SIQ?t=1008
2인 잡기 사방던지기|https://youtu.be/l0TaZJsXiIo?t=141
2인 잡기 호흡던지기|1|https://youtu.be/l0TaZJsXiIo?t=226
2인 잡기 호흡던지기|2|https://youtu.be/l0TaZJsXiIo?t=306
단도잡기 좌기 정면타 5교|오모테|https://youtu.be/l0TaZJsXiIo?t=376
단도잡기 좌기 정면타 5교|우라|https://youtu.be/l0TaZJsXiIo?t=493
단도잡기 횡면타 5교|오모테|https://youtu.be/l0TaZJsXiIo?t=593
단도잡기 횡면타 5교|우라|https://youtu.be/l0TaZJsXiIo?t=713
단도잡기 찌르기 팔꿈치굳히기(6교)|https://youtu.be/l0TaZJsXiIo?t=819
단도잡기 찌르기 손목뒤집기|https://youtu.be/l0TaZJsXiIo?t=909
단도잡기 횡면타 사방던지기|https://youtu.be/l0TaZJsXiIo?t=989
검잡기 손목뒤집기|https://youtu.be/l0TaZJsXiIo?t=1079
검잡기 호흡던지기|https://youtu.be/l0TaZJsXiIo?t=1149
장잡기 입신던지기|https://youtu.be/l0TaZJsXiIo?t=1219
장잡기 호흡던지기|https://youtu.be/l0TaZJsXiIo?t=1274
장잡기 사방던지기|https://youtu.be/l0TaZJsXiIo?t=1339`;

const videoMap=new Map<string,VideoLink[]>();
VIDEO_TEXT.trim().split("\n").forEach(line=>{const p=line.split("|");const name=p[0],label=p.length===3?p[1]:undefined,url=p[p.length-1];videoMap.set(name,[...(videoMap.get(name)??[]),{label,url}])});
function techniqueOf(name:string){return ["합기떨어뜨리기","외회전던지기","내회전던지기","입신던지기","사방던지기","손목뒤집기","천지던지기","허리던지기","호흡던지기","십자던지기","구석던지기","호흡법","5교","4교","3교","2교","1교"].find(v=>name.includes(v))??"기타"}
function kataFrom(name:string,grade?:Grade,exam=false,hombu=true):Kata{const form=name.startsWith("좌기 ")?"좌기":name.startsWith("반신반립 ")?"반신반립":"입기";const technique=techniqueOf(name);const clean=name.replace(/^(좌기|반신반립) /,"");const attack=clean.slice(0,Math.max(0,clean.lastIndexOf(` ${technique}`)))||clean;const area=name.startsWith("2인")?"다인 잡기":/^(단도잡기|검잡기|장잡기)/.test(name)?"무기 잡기":technique==="호흡법"?"호흡력":"일반 체술";return{id:name.replace(/\s/g,"-"),name,form,attack,technique,grade,hombu,exam,area,links:videoMap.get(name)??[]}}
const examNames=new Set(Object.values(EXAM_GROUPS).flatMap(g=>g.kata));
const examKatas=(Object.entries(EXAM_GROUPS) as [string,(typeof EXAM_GROUPS)[Grade]][]).flatMap(([grade,g])=>g.kata.map(name=>kataFrom(name,Number(grade) as Grade,true,true)));
export const KATAS:Kata[]=[...examKatas,...[...videoMap.keys()].filter(name=>!examNames.has(name)).map(name=>kataFrom(name,undefined,false,!/^(2인|단도잡기|검잡기|장잡기|맞서한손잡기에서)/.test(name)))].filter((k,i,a)=>a.findIndex(x=>x.name===k.name)===i);
export const GRADES:Grade[]=[9,8,7,6,5,4,3,2,1];
export function bandText(date:string,session:number,katas:Kata[]){const d=new Date(`${date}T00:00:00`);const ds=`${String(d.getFullYear()).slice(2)}. ${d.getMonth()+1}. ${d.getDate()}.`;const entries=katas.map(k=>{if(!k.links.length)return`○ ${k.name}`;if(k.links.length===1&&!k.links[0].label)return`○ ${k.name} ${k.links[0].url}`;return`○ ${k.name}\n${k.links.map(l=>`(${l.label??"영상"}) ${l.url}`).join("\n")}`});return`【 #수업일지 】 ${ds}(${session}차)\n\n${entries.join("\n\n")}`}
