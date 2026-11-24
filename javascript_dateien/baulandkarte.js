"use strict";
/* Wohnradar-Baulandkarte; Preiswerte stammen aus der bestehenden validierten Kartenberechnung. */
(async function initWohnradarBaulandkarte(){
 const $=id=>document.getElementById(id);
 const frame=$('wr-blmap-frame'),canvas=$('wr-blmap-canvas');if(!frame||!canvas)return;
 const ctx=canvas.getContext('2d',{alpha:false});
 const pickCanvas=document.createElement('canvas'),pickCtx=pickCanvas.getContext('2d',{willReadFrequently:true});
 const tip=$('wr-blmap-tooltip'),details=$('wr-blmap-details');
 const steps=[200,400,600,850,1200,1800,2800];
 const colors=['#f2efd5','#e1e9bd','#c4ddad','#95cda0','#5fb7a3','#429eae','#347c9d','#344c75'];
 const labels=['Unter 200','200–399','400–599','600–849','850–1’199','1’200–1’799','1’800–2’799','Ab 2’800'];
 const fmt=n=>Math.round(n).toLocaleString('de-CH');
 const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const currentType=()=>document.querySelector('input[name="landType"]:checked')?.value||'single';
 const mult={single:.39,medium:.50,multi:.65};
 let geo,prices,paths=[],boxes=[],selected=null,hovered=null,width=1,height=1,dpr=1,base=1,zoom=1,ox=0,oy=0,midX=0,midY=0,fullW=1,fullH=1;
 try{
  const resp=await fetch('daten/baulandkarte_daten.json');
  if(!resp.ok)throw new Error('Kartendaten nicht gefunden (HTTP '+resp.status+')');
  const data=await resp.json();geo=data.polygone;prices=data.preise;
  const X0=5.83,Y0=48.01,COS=Math.cos(46.85*Math.PI/180);
  const px=lon=>(lon-X0)*COS*310,py=lat=>(Y0-lat)*310;
  // Geometrien für Zeichen- und Auswahlcanvas.
  for(const [plz,geom] of geo){
   const polygons=geom[0]==='Polygon'?[geom[1]]:geom[1];const path=new Path2D();let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
   for(const poly of polygons)for(const ring of poly){for(let j=0;j<ring.length;j++){
    const x=px(ring[j][0]),y=py(ring[j][1]);if(!j)path.moveTo(x,y);else path.lineTo(x,y);
    x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
   }path.closePath()}
   paths.push([plz,path]);boxes.push([x0,y0,x1,y1]);
  }
 }catch(err){console.error('Baulandkarte:',err);$('wr-blmap-summary').textContent='Kartendaten konnten nicht geladen werden. Bitte baulandkarte_daten.json im Ordner daten/ prüfen.';return}
 const level=b=>{if(b==null||!Number.isFinite(b))return -1;const v=b*mult[currentType()];let i=0;while(i<steps.length&&v>=steps[i])i++;return i};
 function legends(){
  const counts=Array(8).fill(0);let missing=0,valid=0;
  for(const [plz,d] of Object.entries(prices)){const i=level(d?.b);if(i<0)missing++;else{counts[i]++;valid++}}
  $('wr-blmap-legend').innerHTML=colors.map((c,i)=>`<div class="wr-blmap-legend-item"><span class="wr-blmap-swatch" style="background:${c}"></span><span>${labels[i]} CHF/m²</span><span class="wr-blmap-count">${fmt(counts[i])}</span></div>`).join('')+`<div class="wr-blmap-legend-item"><span class="wr-blmap-swatch" style="background:#c8d0ce"></span><span>Keine Daten</span><span class="wr-blmap-count">${missing}</span></div>`;
  $('wr-blmap-summary').textContent=`${fmt(valid)} Postleitzahlen mit Preisangaben`;
 }
 function transform(c){const s=dpr*base*zoom;c.setTransform(s,0,0,s,dpr*ox,dpr*oy)}
 function draw(){
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#e7f0ef';ctx.fillRect(0,0,canvas.width,canvas.height);
  pickCtx.setTransform(1,0,0,1,0,0);pickCtx.fillStyle='rgb(0,0,0)';pickCtx.fillRect(0,0,pickCanvas.width,pickCanvas.height);
  transform(ctx);transform(pickCtx);const s=base*zoom;
  ctx.lineWidth=Math.max(.11,.7/s);ctx.lineJoin='round';ctx.strokeStyle='rgba(255,255,255,.75)';
  const x0=-ox/s,x1=(width-ox)/s,y0=-oy/s,y1=(height-oy)/s;
  for(let i=0;i<paths.length;i++){
   const b=boxes[i];if(b[2]<x0||b[0]>x1||b[3]<y0||b[1]>y1)continue;
   const k=level(prices[paths[i][0]]?.b);ctx.fillStyle=k<0?'#c8d0ce':colors[k];ctx.fill(paths[i][1],'evenodd');ctx.stroke(paths[i][1]);
   const v=i+1;pickCtx.fillStyle=`rgb(${v&255},${(v>>8)&255},${(v>>16)&255})`;pickCtx.fill(paths[i][1],'evenodd');
  }
  const active=hovered||selected;if(active){ctx.lineWidth=Math.max(1.8/s,.1);ctx.strokeStyle='#25352f';for(const [p,path] of paths)if(p===active)ctx.stroke(path)}
 }
 function reset(){base=Math.min(width/(fullW*1.09),height/(fullH*1.16));zoom=1;ox=width/2-base*midX;oy=height/2-base*midY;draw()}
 function layout(){const r=frame.getBoundingClientRect();if(r.width<=0||r.height<=0)return;width=r.width;height=r.height;dpr=Math.min(devicePixelRatio||1,2);for(const c of [canvas,pickCanvas]){c.width=Math.round(width*dpr);c.height=Math.round(height*dpr)}
  const minX=Math.min(...boxes.map(b=>b[0])),maxX=Math.max(...boxes.map(b=>b[2]));const minY=Math.min(...boxes.map(b=>b[1])),maxY=Math.max(...boxes.map(b=>b[3]));midX=(minX+maxX)/2;midY=(minY+maxY)/2;fullW=maxX-minX;fullH=maxY-minY;reset()}
 function pick(x,y){if(x<0||y<0||x>=width||y>=height)return null;const c=pickCtx.getImageData(Math.floor(x*dpr),Math.floor(y*dpr),1,1).data;const i=c[0]+(c[1]<<8)+(c[2]<<16)-1;return i>=0&&i<paths.length?paths[i][0]:null}
 function point(e){const r=frame.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
 function zoomAt(f,x,y){const z=Math.max(1,Math.min(22,zoom*f));const r=z/zoom;ox=x-(x-ox)*r;oy=y-(y-oy)*r;zoom=z;draw()}
 function detail(plz,focus=false){selected=plz;const d=prices[plz];if(!d){details.innerHTML=`<div class="wr-blmap-place">PLZ ${safe(plz)}</div><p class="wr-blmap-note">Keine ausreichenden Preisdaten.</p>`}else{
  const v=d.b*mult[currentType()];details.innerHTML=`<div class="wr-blmap-place">${safe(plz)} ${safe(d.n)}</div><div class="wr-blmap-note">${safe(d.g||'Gemeinde nicht zugeordnet')}</div><div class="wr-blmap-price">${fmt(v)} CHF/m²</div><div class="wr-blmap-note">Orientierungsbereich: ${fmt(v*.8)}–${fmt(v*1.2)} CHF/m²</div>`;
 }
 if(focus){const ids=[];for(let i=0;i<paths.length;i++)if(paths[i][0]===plz)ids.push(i);if(ids.length){const b=ids.reduce((a,i)=>[Math.min(a[0],boxes[i][0]),Math.min(a[1],boxes[i][1]),Math.max(a[2],boxes[i][2]),Math.max(a[3],boxes[i][3])],[Infinity,Infinity,-Infinity,-Infinity]);
  const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;zoom=Math.min(14,Math.max(3,Math.min(width/(Math.max(b[2]-b[0],1)*2.3),height/(Math.max(b[3]-b[1],1)*2.3))/base));ox=width/2-cx*base*zoom;oy=height/2-cy*base*zoom;}}
 draw()}
 for(const r of document.querySelectorAll('input[name="landType"]'))r.addEventListener('change',()=>{legends();if(selected)detail(selected);else draw()});
 // Die bereits existierende Ortssuche bleibt alleinige Suche. Nach Auswahl Karte auf PLZ ausrichten.
 const input=$('placeInput');let lastSearch='';
 function syncSearch(){const m=(input?.value||'').trim().match(/^(\d{4})(?:\s|$)/);if(m&&m[1]!==lastSearch&&prices[m[1]]){lastSearch=m[1];detail(m[1],true)}else if(!m)lastSearch=''}
 input?.addEventListener('change',syncSearch);input?.addEventListener('blur',()=>setTimeout(syncSearch,50));
 document.addEventListener('click',e=>{if(e.target.closest('#suggestions [role="option"], #suggestions button, #suggestions *'))setTimeout(syncSearch,30)});
 $('wr-blmap-zoom-in').addEventListener('click',()=>zoomAt(1.7,width/2,height/2));$('wr-blmap-zoom-out').addEventListener('click',()=>zoomAt(1/1.7,width/2,height/2));$('wr-blmap-reset').addEventListener('click',reset);
 frame.addEventListener('wheel',e=>{e.preventDefault();const p=point(e);zoomAt(Math.exp(-Math.sign(e.deltaY)*.18),p.x,p.y)},{passive:false});
 let dragging=false,dragged=false,startX=0,startY=0,lastX=0,lastY=0;
 frame.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;frame.setPointerCapture(e.pointerId);dragging=true;dragged=false;startX=lastX=e.clientX;startY=lastY=e.clientY});
 frame.addEventListener('pointermove',e=>{const p=point(e);if(dragging){const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;if(Math.hypot(e.clientX-startX,e.clientY-startY)>5)dragged=true;if(dragged){ox+=dx;oy+=dy;draw()}tip.style.display='none';return}
  const hit=pick(p.x,p.y);if(hit!==hovered){hovered=hit;draw()}if(hit){const d=prices[hit];tip.innerHTML=`<strong>${hit} ${safe(d?.n||'')}</strong><div>${d?fmt(d.b*mult[currentType()])+' CHF/m²':'Keine Daten'}</div>`;tip.style.left=Math.max(5,Math.min(innerWidth-230,e.clientX+14))+'px';tip.style.top=Math.max(5,Math.min(innerHeight-65,e.clientY+12))+'px';tip.style.display='block'}else tip.style.display='none'});
 frame.addEventListener('pointerup',e=>{if(dragging&&!dragged){const p=point(e),hit=pick(p.x,p.y);if(hit)detail(hit)}dragging=false});frame.addEventListener('pointercancel',()=>dragging=false);
 frame.addEventListener('pointerleave',()=>{hovered=null;tip.style.display='none';if(!dragging)draw()});
 let touchDist=null;
 frame.addEventListener('touchmove',e=>{if(e.touches.length===2){e.preventDefault();const a=e.touches[0],b=e.touches[1],dist=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),r=frame.getBoundingClientRect();if(touchDist)zoomAt(dist/touchDist,(a.clientX+b.clientX)/2-r.left,(a.clientY+b.clientY)/2-r.top);touchDist=dist}},{passive:false});
 frame.addEventListener('touchend',()=>touchDist=null);
 window.addEventListener('resize',layout);
 if('ResizeObserver' in window)new ResizeObserver(()=>{if(Math.abs(frame.clientWidth-width)>1||Math.abs(frame.clientHeight-height)>1)layout()}).observe(frame);
 legends();layout();
})();
