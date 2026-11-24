"use strict";
/* Wohnradar Baulandkarte: mobil scrollfreundlich, sechs Farbstufen, schnelle Karten-Zwischenspeicherung. */
(async function initWohnradarBaulandkarte(){
 const $=id=>document.getElementById(id);
 const frame=$('wr-blmap-frame'),canvas=$('wr-blmap-canvas');if(!frame||!canvas)return;
 const ctx=canvas.getContext('2d',{alpha:false});
 const tip=$('wr-blmap-tooltip'),details=$('wr-blmap-details');
 const steps=[300,600,1000,1600,2600];
 const colors=['#f2efd5','#d8e4b7','#a2d2a2','#65bbaa','#3b92a8','#344c75'];
 const labels=['Unter 300','300–599','600–999','1’000–1’599','1’600–2’599','Ab 2’600'];
 const fmt=n=>Math.round(n).toLocaleString('de-CH');
 const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const currentType=()=>document.querySelector('input[name="landType"]:checked')?.value||'single';
 const mult={single:.39,medium:.50,multi:.65};
 const mobile=()=>window.matchMedia('(pointer:coarse)').matches;
 let prices={},paths=[],boxes=[],pathIndex=new Map(),selected=null,hovered=null;
 let width=1,height=1,dpr=1,base=1,zoom=1,ox=0,oy=0,midX=0,midY=0,fullW=1,fullH=1;
 let minX=0,minY=0,maxX=0,maxY=0,atlas=null,atlasCtx=null,atlasScale=1,ready=false;
 let raf=0,hoverClock=0;
 const level=b=>{if(b==null||!Number.isFinite(b))return -1;const v=b*mult[currentType()];let i=0;while(i<steps.length&&v>=steps[i])i++;return i};
 function legends(){
  $('wr-blmap-legend').innerHTML=colors.map((c,i)=>`<div class="wr-blmap-legend-item"><span class="wr-blmap-swatch" style="background:${c}"></span><span>${labels[i]} CHF/m²</span></div>`).join('');
  // Keine Summen je Preisstufe und keine zusätzliche «Keine Daten»-Stufe.
 }
 function rebuildAtlas(){
  if(!paths.length)return;
  // Alle PLZ-Flächen nur beim Laden, Resize oder Wechsel der Ausnützung rasterisieren.
  // 1800 Pixel auf Smartphones reduziert Speicherbedarf und CPU-Last.
  const pixelWidth=mobile()?1800:2600;
  atlasScale=pixelWidth/fullW;
  atlas=document.createElement('canvas');atlas.width=pixelWidth;atlas.height=Math.ceil(fullH*atlasScale);
  atlasCtx=atlas.getContext('2d',{alpha:false});
  atlasCtx.setTransform(1,0,0,1,0,0);atlasCtx.fillStyle='#e7f0ef';atlasCtx.fillRect(0,0,atlas.width,atlas.height);
  atlasCtx.setTransform(atlasScale,0,0,atlasScale,-minX*atlasScale,-minY*atlasScale);
  atlasCtx.lineJoin='round';atlasCtx.lineWidth=0.4/atlasScale;atlasCtx.strokeStyle='rgba(255,255,255,.67)';
  for(const [plz,path] of paths){
   const c=level(prices[plz]?.b);atlasCtx.fillStyle=c<0?'#c8d0ce':colors[c];
   atlasCtx.fill(path,'evenodd');atlasCtx.stroke(path);
  }
 }
 function draw(){
  if(!ready)return;
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#e7f0ef';ctx.fillRect(0,0,canvas.width,canvas.height);
  const s=base*zoom;
  if(atlas){
   ctx.imageSmoothingEnabled=true;
   ctx.drawImage(atlas,(ox+minX*s)*dpr,(oy+minY*s)*dpr,fullW*s*dpr,fullH*s*dpr);
  }
  const active=hovered||selected;
  if(active){
   ctx.setTransform(s*dpr,0,0,s*dpr,ox*dpr,oy*dpr);
   ctx.strokeStyle='#24382f';ctx.lineWidth=Math.max(2.2/s,.15);ctx.lineJoin='round';
   for(const i of pathIndex.get(active)||[])ctx.stroke(paths[i][1]);
  }
 }
 function scheduleDraw(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;draw()})}
 function reset(){base=Math.min(width/(fullW*1.035),height/(fullH*1.11));zoom=1;ox=width/2-base*midX;oy=height/2-base*midY;scheduleDraw()}
 function layout(){if(!ready)return;const r=frame.getBoundingClientRect();if(r.width<10||r.height<10)return;
  if(Math.abs(width-r.width)<1&&Math.abs(height-r.height)<1)return;
  width=r.width;height=r.height;dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);reset();
 }
 // Hit-Test: keine zweite, bei jedem Wischen neu zu zeichnende Canvas-Ebene.
 // Stattdessen werden zuerst die geometrischen Umgrenzungen geprüft.
 const hitCtx=document.createElement('canvas').getContext('2d');
 function pick(x,y){
  if(x<0||y<0||x>width||y>height)return null;
  const s=base*zoom,wx=(x-ox)/s,wy=(y-oy)/s;
  for(let i=paths.length-1;i>=0;i--){const b=boxes[i];if(wx>=b[0]&&wx<=b[2]&&wy>=b[1]&&wy<=b[3]&&hitCtx.isPointInPath(paths[i][1],wx,wy,'evenodd'))return paths[i][0]}
  return null;
 }
 function point(e){const r=frame.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
 function zoomAt(f,x,y){const z=Math.max(1,Math.min(22,zoom*f));const r=z/zoom;ox=x-(x-ox)*r;oy=y-(y-oy)*r;zoom=z;scheduleDraw()}
 function detail(plz,focus=false){selected=plz;const d=prices[plz];
  if(!d){details.innerHTML=`<div class="wr-blmap-place">PLZ ${safe(plz)}</div><p class="wr-blmap-note">Keine ausreichenden Preisdaten.</p>`}
  else {const v=d.b*mult[currentType()];details.innerHTML=`<div class="wr-blmap-place">${safe(plz)} ${safe(d.n)}</div><div class="wr-blmap-note">${safe(d.g||'Gemeinde nicht zugeordnet')}</div><div class="wr-blmap-price">${fmt(v)} CHF/m²</div><div class="wr-blmap-note">Orientierungsbereich: ${fmt(v*.8)}–${fmt(v*1.2)} CHF/m²</div>`}
  if(focus){const ids=pathIndex.get(plz)||[];if(ids.length){const b=ids.reduce((a,i)=>[Math.min(a[0],boxes[i][0]),Math.min(a[1],boxes[i][1]),Math.max(a[2],boxes[i][2]),Math.max(a[3],boxes[i][3])],[Infinity,Infinity,-Infinity,-Infinity]);
    const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;
    zoom=Math.min(14,Math.max(3,Math.min(width/(Math.max(b[2]-b[0],1)*2.3),height/(Math.max(b[3]-b[1],1)*2.3))/base));
    ox=width/2-cx*base*zoom;oy=height/2-cy*base*zoom;
   }}scheduleDraw();
 }
 // Karte erst bei Annäherung an ihren sichtbaren Bereich laden; schont den Rechner beim Seitenaufbau.
 async function load(){if(ready||load.started)return;load.started=true;
  try{
   const resp=await fetch('daten/baulandkarte_daten.json');if(!resp.ok)throw new Error('Kartendaten HTTP '+resp.status);
   const data=await resp.json();prices=data.preise;
   const X0=5.83,Y0=48.01,COS=Math.cos(46.85*Math.PI/180);const px=lon=>(lon-X0)*COS*310,py=lat=>(Y0-lat)*310;
   let index=0;
   for(const [plz,geom] of data.polygone){
    const polygons=geom[0]==='Polygon'?[geom[1]]:geom[1],path=new Path2D();let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const poly of polygons)for(const ring of poly){for(let j=0;j<ring.length;j++){const x=px(ring[j][0]),y=py(ring[j][1]);if(!j)path.moveTo(x,y);else path.lineTo(x,y);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}path.closePath()}
    paths.push([plz,path]);boxes.push([x0,y0,x1,y1]);if(!pathIndex.has(plz))pathIndex.set(plz,[]);pathIndex.get(plz).push(paths.length-1);
    if(++index%140===0)await new Promise(r=>setTimeout(r,0));
   }
   minX=Math.min(...boxes.map(b=>b[0]));maxX=Math.max(...boxes.map(b=>b[2]));minY=Math.min(...boxes.map(b=>b[1]));maxY=Math.max(...boxes.map(b=>b[3]));
   fullW=maxX-minX;fullH=maxY-minY;midX=(minX+maxX)/2;midY=(minY+maxY)/2;
   rebuildAtlas();ready=true;legends();layout();
  }catch(err){console.error('Baulandkarte:',err);const s=$('wr-blmap-summary');if(s){s.hidden=false;s.textContent='Kartendaten konnten nicht geladen werden.'}}
 }
 if('IntersectionObserver' in window){const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){io.disconnect();load()}},{rootMargin:'350px'});io.observe($('wr-blmap-card'))}else load();
 for(const r of document.querySelectorAll('input[name="landType"]'))r.addEventListener('change',()=>{if(!ready)return;rebuildAtlas();if(selected)detail(selected);else scheduleDraw()});
 const input=$('placeInput');let lastSearch='';
 function syncSearch(){if(!ready)return;const m=(input?.value||'').trim().match(/^(\d{4})(?:\s|$)/);if(m&&m[1]!==lastSearch&&prices[m[1]]){lastSearch=m[1];detail(m[1],true)}else if(!m)lastSearch=''}
 input?.addEventListener('change',syncSearch);input?.addEventListener('blur',()=>setTimeout(syncSearch,50));
 document.addEventListener('click',e=>{if(e.target.closest('#suggestions'))setTimeout(syncSearch,30)});
 $('wr-blmap-zoom-in')?.addEventListener('click',()=>zoomAt(1.7,width/2,height/2));
 $('wr-blmap-zoom-out')?.addEventListener('click',()=>zoomAt(1/1.7,width/2,height/2));
 $('wr-blmap-reset')?.addEventListener('click',reset);
 const full=$('wr-blmap-fullscreen');
 function toggleFull(force){const next=typeof force==='boolean'?force:!frame.classList.contains('wr-blmap-expanded');frame.classList.toggle('wr-blmap-expanded',next);document.body.classList.toggle('wr-blmap-open',next);
  if(full){full.textContent=next?'×':'⛶';full.setAttribute('aria-label',next?'Vollbild schliessen':'Karte im Vollbild anzeigen')}
  requestAnimationFrame(()=>{width=0;layout()});
 }
 full?.addEventListener('click',()=>toggleFull());document.addEventListener('keydown',e=>{if(e.key==='Escape'&&frame.classList.contains('wr-blmap-expanded'))toggleFull(false)});
 frame.addEventListener('wheel',e=>{if(mobile()&&!frame.classList.contains('wr-blmap-expanded'))return;e.preventDefault();const p=point(e);zoomAt(Math.exp(-Math.sign(e.deltaY)*.18),p.x,p.y)},{passive:false});
 // Maus: wie bisher ziehen. Berührung: ein Finger scrollt die Seite, zwei Finger bedienen die Karte.
 let dragging=false,dragged=false,startX=0,startY=0,lastX=0,lastY=0;
 frame.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.pointerType==='touch')return;frame.setPointerCapture(e.pointerId);dragging=true;dragged=false;startX=lastX=e.clientX;startY=lastY=e.clientY});
 frame.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const p=point(e);
  if(dragging){const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;if(Math.hypot(e.clientX-startX,e.clientY-startY)>5)dragged=true;if(dragged){ox+=dx;oy+=dy;scheduleDraw()}tip.style.display='none';return}
  const t=performance.now();if(t-hoverClock<45)return;hoverClock=t;
  const hit=pick(p.x,p.y);if(hit!==hovered){hovered=hit;scheduleDraw()}
  if(hit){const d=prices[hit];tip.innerHTML=`<strong>${hit} ${safe(d?.n||'')}</strong><div>${d?fmt(d.b*mult[currentType()])+' CHF/m²':'Keine Daten'}</div>`;
   tip.style.left=Math.max(5,Math.min(innerWidth-230,e.clientX+14))+'px';tip.style.top=Math.max(5,Math.min(innerHeight-65,e.clientY+12))+'px';tip.style.display='block';}
  else tip.style.display='none';
 });
 frame.addEventListener('pointerup',e=>{if(e.pointerType==='touch')return;if(dragging&&!dragged){const p=point(e),hit=pick(p.x,p.y);if(hit)detail(hit)}dragging=false});
 frame.addEventListener('pointercancel',()=>dragging=false);
 frame.addEventListener('pointerleave',()=>{hovered=null;tip.style.display='none';if(!dragging)scheduleDraw()});
 // Touch: erst ab zwei Fingern verhindern wir das Scrollen und verändern die Karte.
 let twoTouch=null,touchDragged=false,startTouch=null;
 function touchPair(e){const a=e.touches[0],b=e.touches[1],r=frame.getBoundingClientRect();return {x:(a.clientX+b.clientX)/2-r.left,y:(a.clientY+b.clientY)/2-r.top,dist:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)}}
 frame.addEventListener('touchstart',e=>{if(e.target.closest('button'))return;if(e.touches.length===2){twoTouch=touchPair(e);touchDragged=true;}else if(e.touches.length===1){startTouch={x:e.touches[0].clientX,y:e.touches[0].clientY};touchDragged=false}},{passive:true});
 frame.addEventListener('touchmove',e=>{if(e.touches.length!==2){twoTouch=null;return}e.preventDefault();const cur=touchPair(e);if(twoTouch){ox+=cur.x-twoTouch.x;oy+=cur.y-twoTouch.y;if(twoTouch.dist>0)zoomAt(cur.dist/twoTouch.dist,cur.x,cur.y);else scheduleDraw()}twoTouch=cur;touchDragged=true},{passive:false});
 frame.addEventListener('touchend',e=>{if(e.touches.length<2)twoTouch=null;if(e.touches.length===0&&startTouch&&!touchDragged&&e.changedTouches.length===1){const end=e.changedTouches[0];if(Math.hypot(end.clientX-startTouch.x,end.clientY-startTouch.y)<12){const r=frame.getBoundingClientRect(),hit=pick(end.clientX-r.left,end.clientY-r.top);if(hit)detail(hit)}}if(e.touches.length===0)startTouch=null},{passive:true});
 window.addEventListener('resize',()=>{if(ready)layout()});
 if('ResizeObserver' in window)new ResizeObserver(()=>{if(ready&&(Math.abs(frame.clientWidth-width)>1||Math.abs(frame.clientHeight-height)>1))layout()}).observe(frame);
})();
