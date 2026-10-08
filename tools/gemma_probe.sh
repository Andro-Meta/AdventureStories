#!/usr/bin/env bash
# gemma_probe.sh - wait until the game is in front on the phone, then time Gemma
# on Google from inside the app (key stays in the app; only status/ms printed).
D=${ADB_DEVICE:-192.168.1.44:41529}
for i in $(seq 1 360); do
  U=$(adb -s $D shell "dumpsys package com.androsmeta.adventurestories" | grep -m1 -oE "appId=[0-9]+" | cut -d= -f2)
  adb -s $D shell "dumpsys connectivity" | grep -E "UID=$U " | grep -q "blocked=NONE\|procState=TOP" && break
  sleep 5
done
node tools/phone.mjs eval "(async()=>{const C=await import('/config.js');const out=[];const sys='You are the storyteller of a turn-based text adventure. '.repeat(120);
for (const slot of ['gemma_google','gemma_google_2']) { const p=C.CLOUD_PROVIDERS[slot]; const k=C.keyForProvider(p); if(!k){out.push({slot,skip:'no key'});continue;}
 for (const [label,body] of [['tiny',{model:p.model,messages:[{role:'user',content:'Reply with the word OK.'}],max_tokens:10}],['json_mode',{model:p.model,messages:[{role:'user',content:'Reply with JSON {\"ok\":true}'}],max_tokens:30,response_format:{type:'json_object'}}],['turn_sized',{model:p.model,messages:[{role:'user',content:sys+' Write 150 words of story as JSON {\"narration\":\"...\",\"choices\":[]}'}],max_tokens:1200,response_format:{type:'json_object'}}],['turn_sized_plain',{model:p.model,messages:[{role:'user',content:sys+' Write 150 words of story as JSON {\"narration\":\"...\",\"choices\":[]}'}],max_tokens:1200}]]){
  const t=Date.now(); try{const r=await fetch(p.baseUrl+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+k},body:JSON.stringify(body)});const txt=await r.text();out.push({slot,label,status:r.status,ms:Date.now()-t,body:txt.slice(0,140)})}catch(e){out.push({slot,label,err:e.message,ms:Date.now()-t})}}}
return out})()"
