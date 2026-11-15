const $=id=>document.getElementById(id);
const video=$('video'), overlay=$('overlay'), ctx=overlay.getContext('2d');
let stream=null, model=null, detecting=false, timer=null, lastSpoken='', lastSpeakAt=0, captured=null, worker=null, installPrompt=null;
const labels={person:'شخص',bicycle:'دراجة',car:'سيارة',motorcycle:'موتوسيكل',bus:'أتوبيس',truck:'شاحنة',traffic_light:'إشارة مرور',fire_hydrant:'صنبور إطفاء',stop_sign:'علامة توقف',bench:'مقعد',bird:'طائر',cat:'قطة',dog:'كلب',backpack:'حقيبة ظهر',umbrella:'شمسية',handbag:'حقيبة',suitcase:'حقيبة سفر',chair:'كرسي',couch:'أريكة',potted_plant:'نبات',bed:'سرير',dining_table:'طاولة',toilet:'مرحاض',tv:'شاشة',laptop:'حاسوب محمول',cell_phone:'هاتف',book:'كتاب',clock:'ساعة',bottle:'زجاجة',cup:'كوب'};
const say=text=>{if(!$('voiceToggle').checked||!('speechSynthesis'in window))return; speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=$('lang').value;u.rate=.92;speechSynthesis.speak(u);if($('vibrateToggle').checked&&navigator.vibrate)navigator.vibrate([100,60,100]);};
function status(t,on=false){$('camState').textContent=t;$('camState').classList.toggle('on',on);}
async function startCamera(){
 if(!navigator.mediaDevices?.getUserMedia){$('modelStatus').textContent='الكاميرا تحتاج Chrome حديثاً واتصال HTTPS أو localhost.';return;}
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
  video.srcObject=stream;await video.play();video.style.display='block';$('empty').hidden=true;$('liveTag').hidden=false;
  overlay.width=video.videoWidth;overlay.height=video.videoHeight;status('الكاميرا تعمل',true);
  $('startBtn').disabled=true;$('stopBtn').disabled=false;$('captureBtn').disabled=false;$('ocrBtn').disabled=false;$('sceneBtn').disabled=false;
  $('modelStatus').textContent='الكاميرا تعمل. جاري تحميل نموذج اكتشاف الأشياء...';
  if(!model){try{model=await cocoSsd.load({base:'lite_mobilenet_v2'});$('modelStatus').textContent='تم تحميل نموذج COCO-SSD بنجاح. ابدأ اكتشاف الأشياء.';$('detectBtn').disabled=false;}catch(e){$('modelStatus').textContent='تعذر تحميل النموذج. تحقق من الإنترنت ثم أعد تحميل الصفحة.';}}
  say('تم تشغيل الكاميرا. يمكنك بدء اكتشاف الأشياء.');
 }catch(e){$('modelStatus').textContent=({NotAllowedError:'لم تسمح باستخدام الكاميرا. افتح أذونات الموقع واسمح بالكاميرا.',NotFoundError:'لم يتم العثور على كاميرا.',NotReadableError:'الكاميرا مشغولة بتطبيق آخر.'})[e.name]||'تعذر تشغيل الكاميرا: '+e.message;}
}
function stopCamera(){
 detecting=false;clearTimeout(timer);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;video.style.display='none';ctx.clearRect(0,0,overlay.width,overlay.height);
 $('empty').hidden=false;$('liveTag').hidden=true;status('الكاميرا متوقفة');$('startBtn').disabled=false;$('stopBtn').disabled=true;$('detectBtn').disabled=true;$('detectBtn').textContent='بدء اكتشاف الأشياء';$('captureBtn').disabled=true;$('ocrBtn').disabled=true;$('sceneBtn').disabled=true;
}
function pos(x,w){const r=x/w;if(r<.34)return 'على اليمين';if(r>.66)return 'على الشمال';return 'أمامك';}
function paint(preds){
 ctx.clearRect(0,0,overlay.width,overlay.height);if(!$('boxesToggle').checked)return;
 const colors=['#5ee0c0','#77baff','#ffca83','#d5a5ff'];
 preds.forEach((p,i)=>{const [x,y,w,h]=p.bbox;ctx.strokeStyle=colors[i%colors.length];ctx.lineWidth=Math.max(3,overlay.width/350);ctx.strokeRect(x,y,w,h);const text=(labels[p.class]||p.class)+' '+Math.round(p.score*100)+'%';ctx.font=`${Math.max(15,overlay.width/55)}px sans-serif`;const tw=ctx.measureText(text).width;ctx.fillStyle=colors[i%colors.length];ctx.fillRect(x,Math.max(0,y-29),tw+14,27);ctx.fillStyle='#062331';ctx.fillText(text,x+7,Math.max(20,y-10));});
}
async function detectLoop(){
 if(!detecting||!stream)return;
 try{
  const preds=await model.detect(video);const threshold=Number($('confidence').value);const filtered=preds.filter(p=>p.score>=threshold).sort((a,b)=>b.score-a.score);
  paint(filtered);$('count').textContent=filtered.length;
  $('detections').innerHTML=filtered.length?filtered.slice(0,12).map(p=>{const [x,,w]=p.bbox;return `<div class="object"><span>${labels[p.class]||p.class} · ${pos(x+w/2,video.videoWidth)}</span><b>${Math.round(p.score*100)}%</b></div>`}).join(''):'<p class="muted">لم يتم اكتشاف عناصر واضحة في هذه اللقطة.</p>';
  const now=Date.now();if(filtered.length){const p=filtered[0],[x,,w]=p.bbox;const msg=`${labels[p.class]||p.class} ${pos(x+w/2,video.videoWidth)}`;if(msg!==lastSpoken&&now-lastSpeakAt>4500){say('تم رصد '+msg);lastSpoken=msg;lastSpeakAt=now;}}
 }catch(e){$('modelStatus').textContent='حدث خطأ أثناء تحليل الصورة: '+e.message;}
 timer=setTimeout(detectLoop,Number($('scanRate').value));
}
$('startBtn').onclick=startCamera;$('stopBtn').onclick=stopCamera;
$('detectBtn').onclick=()=>{if(!model)return;detecting=!detecting;$('detectBtn').textContent=detecting?'إيقاف اكتشاف الأشياء':'بدء اكتشاف الأشياء';if(detecting){say('بدأ اكتشاف الأشياء');detectLoop();}else{clearTimeout(timer);ctx.clearRect(0,0,overlay.width,overlay.height);}};
$('sceneBtn').onclick=()=>{const items=[...$('detections').querySelectorAll('.object span')].map(x=>x.textContent);say(items.length?'أرى في المشهد: '+items.join('، '):'لم يتم رصد عناصر حالياً.');};
$('testVoice').onclick=()=>say('أهلاً بك في بصيرة. اختبار المساعد الصوتي يعمل.');
$('captureBtn').onclick=()=>{if(!video.videoWidth)return;const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;c.getContext('2d').drawImage(video,0,0);captured=c;$('processed').width=c.width;$('processed').height=c.height;applyFilter();};
function applyFilter(){
 if(!captured)return;const out=$('processed'),o=out.getContext('2d');out.width=captured.width;out.height=captured.height;o.drawImage(captured,0,0);const mode=$('filterSelect').value;if(mode==='original')return;
 const im=o.getImageData(0,0,out.width,out.height),d=im.data;
 if(mode==='gray'||mode==='negative'||mode==='brightness'||mode==='threshold'){for(let i=0;i<d.length;i+=4){let g=.299*d[i]+.587*d[i+1]+.114*d[i+2];if(mode==='gray'){d[i]=d[i+1]=d[i+2]=g;}else if(mode==='negative'){d[i]=255-d[i];d[i+1]=255-d[i+1];d[i+2]=255-d[i+2];}else if(mode==='brightness'){d[i]=Math.min(255,d[i]+35);d[i+1]=Math.min(255,d[i+1]+35);d[i+2]=Math.min(255,d[i+2]+35);}else{g=g>128?255:0;d[i]=d[i+1]=d[i+2]=g;}}}
 if(mode==='edges'){const src=new Uint8ClampedArray(d);const w=out.width,h=out.height;for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=(y*w+x)*4;const gray=(xx,yy)=>{let j=(yy*w+xx)*4;return .299*src[j]+.587*src[j+1]+.114*src[j+2];};const gx=-gray(x-1,y-1)+gray(x+1,y-1)-2*gray(x-1,y)+2*gray(x+1,y)-gray(x-1,y+1)+gray(x+1,y+1);const gy=-gray(x-1,y-1)-2*gray(x,y-1)-gray(x+1,y-1)+gray(x-1,y+1)+2*gray(x,y+1)+gray(x+1,y+1);const v=Math.min(255,Math.hypot(gx,gy));d[i]=d[i+1]=d[i+2]=v;}}
 o.putImageData(im,0,0);
}
$('filterSelect').onchange=applyFilter;
$('ocrBtn').onclick=async()=>{
 if(!captured){$('ocrResult').textContent='التقط صورة أولاً من زر التقاط صورة.';return;}
 $('ocrResult').textContent='جاري تحميل محرك قراءة النصوص وتحليل الصورة...';
 try{if(!worker)worker=await Tesseract.createWorker('ara+eng',1,{logger:m=>{if(m.status==='recognizing text')$('ocrResult').textContent=`جاري قراءة النص: ${Math.round(m.progress*100)}%`;}});const {data}=await worker.recognize(captured);$('ocrResult').textContent=data.text.trim()||'لم يتم العثور على نص واضح. جرّب صورة أقرب وأكثر إضاءة.';$('readResult').disabled=!data.text.trim();}
 catch(e){$('ocrResult').textContent='تعذر تشغيل OCR. تأكد من الإنترنت ثم أعد المحاولة. '+e.message;}
};
$('readResult').onclick=()=>say($('ocrResult').textContent);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream)stopCamera();});window.addEventListener('pagehide',stopCamera);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('installBtn').hidden=false;});
$('installBtn').onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('installBtn').hidden=true;};
if('serviceWorker'in navigator&&location.protocol!=='file:')window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
