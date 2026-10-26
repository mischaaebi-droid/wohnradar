'use strict';

// Die Immobilienpreisdaten werden separat geladen.
// Auf einem Webserver funktioniert dies ohne weitere Einrichtung.
async function ladeImmobilienpreise() {
  const antwort = await fetch('daten/immobilienpreise.json');
  if (!antwort.ok) {
    throw new Error(`Immobilienpreisdaten konnten nicht geladen werden (HTTP ${antwort.status}).`);
  }
  return antwort.json();
}

async function starteHauswert() {

// Daten, Hilfsfunktionen und Modellparameter
const DATA = await ladeImmobilienpreise();
const $=id=>document.getElementById(id),fmt=n=>Math.round(n).toLocaleString('de-CH'),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),YEAR=2026;
const PARTS=[{id:'kitchen',label:'Küche',k:30000,a:.5,b:.25,l:30,lo:20000,hi:50000},{id:'bath',label:'Bäder und WC',k:40000,a:.4,b:.15,l:30,lo:24000,hi:64000},{id:'interior',label:'Innenausbau (Böden, Malerarbeiten, Türen)',k:65000,a:.9,b:.05,l:30},{id:'windows',label:'Fenster',k:35000,a:.8,b:.05,l:35},{id:'heat',label:'Heizung',k:35000,a:.6,b:.05,l:25},{id:'water',label:'Wasser- und Abwasserleitungen',k:30000,a:.7,b:.05,l:50},{id:'electric',label:'Elektroinstallationen',k:25000,a:.75,b:.05,l:40},{id:'roof',label:'Dach',k:50000,a:.8,b:.05,l:50},{id:'facade',label:'Fassade (ohne Dämmung)',k:35000,a:.8,b:.05,l:40}];
const METRICS=[{id:'view',label:'Aussicht',names:['Schlecht','Eingeschränkt','Durchschnittlich','Schön','Sehr schön','Herausragend'],values:[-6,-3,0,4,8,16],def:2},{id:'access',label:'Geschäfte, Schulen und ÖV',names:['Sehr schlecht','Eher schlecht','Durchschnittlich','Gut','Sehr gut'],values:[-6,-3,0,2,5],def:2},{id:'noise',label:'Ruhe / Lärmbelastung',names:['Extrem laut','Stark belastet','Verkehrslärm','Durchschnittlich','Ruhig','Sehr ruhig'],values:[-8,-5.6,-2.3,0,2,4],def:3},{id:'quality',label:'Bauqualität und Wohnkomfort',names:['Einfach','Eher einfach','Durchschnittlich','Gehoben','Sehr hochwertig'],values:[-8,-4,0,4,8],def:2}];
const S={plz:'5400',garage:0,outside:0,mode:'normal',renovations:{}};const places=Object.entries(DATA).map(([plz,d])=>({plz,ort:d.ort,norm:(plz+' '+d.ort).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}));

// Renovationsjahre aus dem gewählten Zustand ableiten
function renovationsFor(mode,b){let r={};for(const p of PARTS){let age=mode==='old'?YEAR-b:mode==='new'?Math.min(YEAR-b,4):Math.min(YEAR-b,({kitchen:18,bath:20,interior:15,windows:25,heat:15,water:30,electric:30,roof:35,facade:30})[p.id]);r[p.id]=YEAR-age;}return r;}

// Detailregler für einzelne Renovationen erstellen
function renderRenos(){let b=+$('built').value;$('ageFields').innerHTML=PARTS.map(p=>{let yr=clamp(S.renovations[p.id]??b,b,YEAR);return `<div class="reno"><div class="rangehead"><label for="reno_${p.id}">${p.label}</label><output id="renov_${p.id}">${yr===b?'Seit Baujahr ('+b+')':yr}</output></div><input type="range" id="reno_${p.id}" min="${b}" max="${YEAR}" step="1" value="${yr}" data-reno="${p.id}"></div>`}).join('');document.querySelectorAll('[data-reno]').forEach(el=>el.addEventListener('input',()=>{S.renovations[el.dataset.reno]=+el.value;let b=+$('built').value;$('renov_'+el.dataset.reno).textContent=+el.value===b?'Seit Baujahr ('+b+')':el.value;calc();}));}

function setMode(mode){S.mode=mode;S.renovations=renovationsFor(mode,+$('built').value);document.querySelectorAll('[data-cond]').forEach(b=>b.classList.toggle('active',b.dataset.cond===mode));renderRenos();calc();}

// Lage- und Komfortregler aufbauen
$('sliders').innerHTML=METRICS.map(s=>`<div class="range"><div class="rangehead"><label for="${s.id}">${s.label}</label><output id="${s.id}v"></output></div><input id="${s.id}" type="range" min="0" max="${s.values.length-1}" value="0" step="1"></div>`).join('');
let placeFocused=false, activeSuggestion=-1;
const mobilePlaceMode=window.matchMedia('(max-width: 840px)');
let selectingPlace=false;
let keyboardTimer=null;
const placeInput=$('placeInput');
placeInput.placeholder='Ort oder PLZ eingeben';
placeInput.setAttribute('autocomplete','off');

// Ortssuche und Auswahl
function normalize(t){return t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}

function closeSuggestions(){clearTimeout(keyboardTimer);const list=$('suggestions');list.classList.add('hide');$('placeInput').setAttribute('aria-expanded','false');activeSuggestion=-1;}

function suggestions(){
  const raw=normalize($('placeInput').value),list=$('suggestions');
  if(!placeFocused||raw.length<3){closeSuggestions();return;}
  const matches=places.filter(p=>p.plz.startsWith(raw)||normalize(p.ort).startsWith(raw)||p.norm.includes(' '+raw)).sort((a,b)=>{
    const as=normalize(a.ort).startsWith(raw)||a.plz.startsWith(raw);
    const bs=normalize(b.ort).startsWith(raw)||b.plz.startsWith(raw);
    return Number(bs)-Number(as)||a.ort.localeCompare(b.ort,'de');
  }).slice(0,12);
  list.replaceChildren();
  matches.forEach((p,i)=>{
    const btn=document.createElement('button');
    btn.type='button';btn.setAttribute('role','option');btn.setAttribute('aria-selected','false');
    btn.id='suggest_'+i;btn.dataset.plz=p.plz;
    btn.append(document.createTextNode(p.ort+' '));
    const small=document.createElement('small');small.textContent='PLZ '+p.plz;btn.append(small);
    btn.addEventListener('pointerdown',e=>e.preventDefault());
    btn.addEventListener('click',()=>choose(p.plz));
    list.append(btn);
  });
  list.classList.toggle('hide',matches.length===0);
  $('placeInput').setAttribute('aria-expanded',String(matches.length>0));
  activeSuggestion=-1;
  if(mobilePlaceMode.matches&&matches.length){
    clearTimeout(keyboardTimer);
    keyboardTimer=setTimeout(()=>{
      if(document.activeElement===$('placeInput')&&!list.classList.contains('hide')&&list.querySelector('button')){
        selectingPlace=true;
        $('placeInput').blur();
        requestAnimationFrame(()=>{if(selectingPlace)list.classList.remove('hide');});
      }
    },550);
  }
}

function choose(plz){if(!DATA[plz])return;selectingPlace=false;S.plz=plz;$('placeInput').value=plz+' '+DATA[plz].ort;closeSuggestions();$('placeHint').textContent='';$('placeInput').blur();calc();}

function highlightSuggestion(i){const buttons=[...$('suggestions').querySelectorAll('button')];if(!buttons.length)return;activeSuggestion=(i+buttons.length)%buttons.length;buttons.forEach((b,j)=>b.setAttribute('aria-selected',String(j===activeSuggestion)));buttons[activeSuggestion].scrollIntoView({block:'nearest'});}

// Verkehrswert berechnen und Ergebnis aktualisieren

function calc() {
    const d = DATA[S.plz];
    if (!d) return;

    const w = +$('living').value;
    const g = +$('land').value;
    const b = +$('built').value;
    const m = d.median;

    $('livingv').textContent = fmt(w) + ' m²';
    $('landv').textContent = fmt(g) + ' m²';
    $('builtv').textContent = b;
    $('garagev').textContent = S.garage;
    $('outsidev').textContent = S.outside;

    let ageDed = 0;

    for (const p of PARTS) {
        let cost = p.k *
            Math.pow(w / 180, p.a) *
            Math.pow(m / 10000, p.b);

        cost = clamp(cost, p.lo ?? 0, p.hi ?? Infinity);

        let renovated = clamp(
            Number(S.renovations[p.id] ?? b) || b,
            b,
            YEAR
        );

        ageDed += cost *
            clamp((YEAR - renovated) / p.l, 0, 1);
    }

    const effectiveLand = Math.max(40, g);

    const ref = m * w *
        Math.pow(w / 180, -.426) *
        Math.pow(effectiveLand / 590, .145) *
        1.18;

    const residualAge = -Math.min(
        3.5,
        Math.max(0, YEAR - b - 15) * .045
    );

    const typePct = {
        free: 0,
        end: -1.2,
        mid: -2.5
    }[document.querySelector('input[name=houseType]:checked').value];

    let micro = 0;
    let quality = 0;

    for (const s of METRICS) {
        const index = +$(s.id).value;
        $(s.id + 'v').textContent = s.names[index];

        if (s.id === 'quality') {
            quality = s.values[index];
        } else {
            micro += s.values[index];
        }
    }

    micro = clamp(micro, -20, 20);

    const afterAge = Math.max(0, ref - ageDed);

    const adjusted = afterAge *
        (1 + (typePct + micro + quality + residualAge) / 100);

    const gp = clamp(
        33000 + .5 * (m - 10000),
        28000,
        38000
    );

    const ap = clamp(
        12000 + .6 * (m - 10000),
        8000,
        18000
    );

    const garageAdjustment = (S.garage - 1) * gp;
    const outsideAdjustment = (S.outside - 1) * ap;

    const park = garageAdjustment + outsideAdjustment;
    const result = Math.max(0, adjusted + park);

    // Verkehrswert und Altersabzug
    $('estimate').textContent = 'CHF ' + fmt(result);
    $('ageout').textContent = '− CHF ' + fmt(ageDed);

    // Anzahl Garagenplätze anzeigen
    $('garageLabel').textContent =
        S.garage + ' ' +
        (S.garage === 1 ? 'Garagenplatz' : 'Garagenplätze');

    // Anzahl Aussenparkplätze anzeigen
    $('outsideLabel').textContent =
        S.outside + ' ' +
        (S.outside === 1 ? 'Aussenparkplatz' : 'Aussenparkplätze');

    // Wertanpassungen anzeigen
    $('garageout').textContent =
        (garageAdjustment >= 0 ? '+ ' : '− ') +
        'CHF ' + fmt(Math.abs(garageAdjustment));

    $('outsideout').textContent =
        (outsideAdjustment >= 0 ? '+ ' : '− ') +
        'CHF ' + fmt(Math.abs(outsideAdjustment));
}


// Ereignisse: Jede Eingabe löst eine unmittelbare Neuberechnung aus
$('placeInput').addEventListener('focus',()=>{
  selectingPlace=false;
  placeFocused=true;
  closeSuggestions();
  // Bei jeder neuen Suche direkt in einem leeren Feld beginnen.
  placeInput.value='';
  placeInput.placeholder='';
  $('placeHint').textContent='';
});

$('placeInput').addEventListener('input',()=>{
  $('placeHint').textContent=$('placeInput').value.trim()?'Ort oder PLZ auswählen':'';
  suggestions();
});

$('clearPlace').addEventListener('click',()=>{
  selectingPlace=false;closeSuggestions();$('placeInput').value='';
  $('placeInput').focus();$('placeHint').textContent='Ortschaft oder PLZ eingeben';
});

$('placeInput').addEventListener('keydown',e=>{
  const buttons=[...$('suggestions').querySelectorAll('button')];
  if(e.key==='ArrowDown'&&buttons.length){e.preventDefault();highlightSuggestion(activeSuggestion+1);}
  else if(e.key==='ArrowUp'&&buttons.length){e.preventDefault();highlightSuggestion(activeSuggestion-1);}
  else if(e.key==='Enter'&&buttons.length){e.preventDefault();choose(buttons[Math.max(0,activeSuggestion)].dataset.plz);}
  else if(e.key==='Escape'){selectingPlace=false;closeSuggestions();$('placeInput').blur();}
});

$('placeInput').addEventListener('blur',()=>{
  placeInput.placeholder='Ort oder PLZ eingeben';
  if(!selectingPlace)clearTimeout(keyboardTimer);
  placeFocused=false;
  setTimeout(()=>{
    // Auf Mobilgeräten darf das automatische Schliessen nach blur
    // die bewusst stehen gelassene Auswahlliste nicht entfernen.
    if(!selectingPlace)closeSuggestions();
    if(!selectingPlace&&$('placeInput').value.trim()&&
      $('placeInput').value!==S.plz+' '+DATA[S.plz].ort){
      $('placeHint').textContent='Bitte einen Ort aus den Vorschlägen wählen';
    }
  },160);
});

document.addEventListener('pointerdown',e=>{
  if(!$('placeInput').contains(e.target)&&!$('suggestions').contains(e.target)&&!$('clearPlace').contains(e.target)){
    selectingPlace=false;closeSuggestions();
  }
});

['living','land',...METRICS.map(s=>s.id)].forEach(id=>$(id).addEventListener('input',calc));
document.querySelectorAll('input[name=houseType]').forEach(el=>el.addEventListener('change',calc));
$('built').addEventListener('input',()=>{S.renovations=renovationsFor(S.mode,+$('built').value);renderRenos();calc();});
document.querySelectorAll('[data-cond]').forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.cond)));
document.querySelectorAll('[data-count]').forEach(btn=>btn.addEventListener('click',()=>{const [k,v]=btn.dataset.count.split(':');S[k]=clamp(S[k]+Number(v),0,8);calc();}));
// Sichtbarkeit und Position der Resultate steuern, ohne das Bewertungsmodell zu verändern.
const resultShell=$('resultShell');
const resultAnchor=document.createComment('Desktop-Position der Resultate');
resultShell.parentNode.insertBefore(resultAnchor,resultShell);
const mobileMode=window.matchMedia('(max-width: 840px)');
function arrangeResult(){
  if(mobileMode.matches){ document.querySelector('header').insertAdjacentElement('afterend',resultShell); }
  else { resultAnchor.parentNode.insertBefore(resultShell,resultAnchor.nextSibling); }
}
arrangeResult();
window.addEventListener('resize',arrangeResult);
function showEstimate(){
  // Die Schätzung wurde im Hintergrund bereits aus den aktuellen Eingaben berechnet.
  calc();
  resultShell.classList.add('has-estimate');
  if(mobileMode.matches){ window.scrollTo({top:0,behavior:'smooth'}); }
}
$('estimateButtonDesktop').addEventListener('click',showEstimate);
$('estimateButtonMobile').addEventListener('click',showEstimate);
$('adjustButton').addEventListener('click',()=>{
  if(mobileMode.matches){
    // Eingaben nachjustieren und anschliessend erneut bewusst schätzen.
    resultShell.classList.remove('has-estimate');
    document.querySelector('.house-overview').scrollIntoView({behavior:'smooth',block:'start'});
  } else {
    document.querySelector('.house-overview').scrollIntoView({behavior:'smooth',block:'start'});
  }
});
$('reset').addEventListener('click',()=>{
  $('living').value=$('living').min;
  $('land').value=$('land').min;
  $('built').value=$('built').min;
  document.querySelector('input[name=houseType][value=free]').checked=true;
  METRICS.forEach(s=>$(s.id).value=0);
  S.garage=0; S.outside=0;
  setMode('normal');
  // Auch die einzeln eingeblendeten Renovationsregler stehen ganz links.
  document.querySelectorAll('[data-reno]').forEach(el=>{el.value=el.min;S.renovations[el.dataset.reno]=Number(el.min);});
  choose(DATA['5400']?'5400':Object.keys(DATA)[0]);
  placeInput.value='';
  $('placeHint').textContent='';
  resultShell.classList.remove('has-estimate');
  if(mobileMode.matches){window.scrollTo({top:0,behavior:'smooth'});}
});

// Ausgangslage: sämtliche Schieber am linken Anschlag.
setMode('normal');
S.renovations=renovationsFor('old',Number($('built').value));
renderRenos();
calc();
// Zu Beginn nur den Platzhalter anzeigen, nicht die Standardgemeinde.
placeInput.value='';
$('placeHint').textContent='';

}

starteHauswert().catch(fehler => {
  console.error('Hauswert: Fehler beim Laden der Preisdaten', fehler);
  const ausgabe = document.getElementById('estimate');
  if (ausgabe) ausgabe.textContent = 'Daten nicht verfügbar';
  const hinweis = document.getElementById('placeHint');
  if (hinweis) hinweis.textContent = 'Immobilienpreise konnten nicht geladen werden. Bitte die Seite über einen Webserver öffnen.';
});