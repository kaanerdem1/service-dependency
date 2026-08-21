- **Node ≠ etiket.** Her servis küçük renkli bir nokta (dot) olsun; etiket bu noktanın biraz ötesine, yarı saydam beyaz bir "pill" arka plan üzerine yazılsın. Ok tam olarak noktada biter, hiçbir zaman metnin üstünden geçmez.
- **Bağlantı eğrisi başlangıç/bitiş noktasını node kenarından hesapla**, merkezden değil — böylece ok ucu her zaman node'un tam kenarında, tutarlı açıyla biter (`marker-end` + `orient="auto-start-reverse"`).
- **Hafif, tutarlı bir Bezier eğrisi** (sabit bir "bow" oranıyla) — düz çizgiler yerine, ama rastgele eğrilik yok; hepsi aynı kurala göre kavisleniyor, o yüzden "yamuk yumuk" hissi kayboluyor.



- **Uzun snake_case isimler için otomatik satır kırma** (`_` karakterinden bölerek), sabit karakter genişliğine göre pill boyutu.

- **Hover = odak modu.** Bir node'un üzerine gelince sadece onunla ilişkili çizgiler/node'lar vurgulanır, geri kalanı soluklaşır — büyük grafiklerde okunabilirlik için kritik.
- **Cytoscape.js** — servis bağımlılık haritaları için en olgun seçenek, `cola`/`dagre`/`elk` layout eklentileriyle çakışmasız otomatik yerleşim yapar.
- **d3-force / d3-hierarchy (radial tree)** — Observable'da "radial tidy tree" örnekleri tam bu senaryo için iyi bir başlangıç noktası.
- **React Flow** — node'ları React bileşeni olarak tanımladığın için etiket taşması otomatik engellenir.
- Referans için gerçek üründe nasıl çözüldüğüne bakmak istersen: Datadog APM Service Map ve Elastic APM Service Map, aynı "merkez + katmanlı bağımlılık" problemini enterprise ölçekte çözüyor — hover-focus ve kenar kalınlığı/renk mantığı oradan esinlendim.



ÖRNEK HTML :  

<!DOCTYPE html>

<html lang="tr">

<head>

<meta charset="UTF-8">

<title>Servis Bağımlılık Haritası — Yeniden Tasarım</title>

<style>

  @import url('[https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap](https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap)');

  :root{

    --bg:#FAFAF7;

    --panel:#FFFFFF;

    --line:#E4E1D9;

    --ink:#1C1E1B;

    --ink-soft:#6B6F68;

    --center:#1F7A5C;

    --center-soft:#E4F3EC;

    --edge:#B9BCB4;

    --edge-hi:#1F7A5C;

    --c-commerce:#4C5FD5;   --c-commerce-bg:#EEF0FC;

    --c-payments:#C9820B;   --c-payments-bg:#FBF1DE;

    --c-finance:#C4463B;    --c-finance-bg:#FBEAE8;

    --c-support:#1D8A7A;    --c-support-bg:#E4F4F1;

    --c-analytics:#7C5CBF;  --c-analytics-bg:#F1ECFA;

    --c-mobile:#55617A;     --c-mobile-bg:#EBEDF1;

  }

  *{box-sizing:border-box;}

  html,body{margin:0;height:100%;background:var(--bg);font-family:'Inter',system-ui,sans-serif;color:var(--ink);overflow:hidden;}

  #stage{position:relative;width:100%;height:100vh;}

  /* top bar */

  #topbar{position:absolute;top:0;left:0;right:0;height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;z-index:5;pointer-events:none;}

  #topbar > *{pointer-events:auto;}

  .back{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:500;color:var(--ink-soft);cursor:pointer;}

  .center-title{display:flex;align-items:center;gap:10px;}

  .center-dot{width:12px;height:12px;border-radius:50%;background:var(--center);}

  .center-title h1{font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:600;margin:0;letter-spacing:-0.2px;}

  .center-title span{font-size:10px;letter-spacing:.08em;color:var(--ink-soft);text-transform:uppercase;display:block;margin-bottom:2px;font-family:'Inter';font-weight:600;}

  #search{width:240px;border:1px solid var(--line);background:var(--panel);border-radius:9px;padding:8px 12px;font-size:13px;font-family:'Inter';outline:none;}

  #search:focus{border-color:var(--center);box-shadow:0 0 0 3px var(--center-soft);}

  /* legend */

  #legend{position:absolute;top:80px;left:20px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;font-size:12px;box-shadow:0 1px 3px rgba(0,0,0,.04);z-index:4;}

  #legend h3{margin:0 0 8px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-soft);font-weight:700;}

  .legend-row{display:flex;align-items:center;gap:8px;padding:3px 0;color:var(--ink);}

  .legend-swatch{width:9px;height:9px;border-radius:3px;flex:none;}

  svg{width:100%;height:100%;display:block;}

  .edge{fill:none;stroke:var(--edge);stroke-width:1.6;transition:stroke .15s, stroke-width .15s, opacity .15s;}

  .edge.dim{opacity:.15;}

  .edge.hi{stroke:var(--edge-hi);stroke-width:2.2;}

  .node-dot{cursor:pointer;transition:opacity .15s, transform .15s;}

  .node-dot.dim{opacity:.2;}

  .node-group:hover .node-dot{filter:brightness(1.08);}

  .label-pill{transition:opacity .15s;}

  .label-pill.dim{opacity:.2;}

  .label-text{font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:500;fill:var(--ink);pointer-events:none;}

  .label-text.match{fill:var(--center);font-weight:600;}

  .layer-tag{font-family:'Inter';font-size:9.5px;font-weight:700;letter-spacing:.07em;fill:var(--ink-soft);text-transform:uppercase;}

  .center-ring{fill:none;stroke:var(--center);stroke-width:1.4;opacity:.35;transform-origin:center;animation:pulse 2.6s ease-out infinite;}

  @keyframes pulse{0%{transform:scale(.9);opacity:.5;}100%{transform:scale(1.9);opacity:0;}}

  /* detail panel */

  #detail{position:absolute;top:80px;right:20px;width:300px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:0 8px 24px rgba(0,0,0,.08);z-index:6;display:none;}

  #[detail.open](http://detail.open){display:block;}

  #detail .dclose{position:absolute;top:12px;right:14px;cursor:pointer;color:var(--ink-soft);font-size:14px;}

  #detail .dtag{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:6px;margin-bottom:10px;}

  #detail h2{font-family:'JetBrains Mono',monospace;font-size:14.5px;line-height:1.4;margin:0 0 6px;word-break:break-word;}

  #detail p{font-size:12px;color:var(--ink-soft);margin:0 0 14px;line-height:1.5;}

  #detail .dsub{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);font-weight:700;margin-bottom:6px;}

  #detail .drow{font-family:'JetBrains Mono',monospace;font-size:11.5px;padding:6px 0;border-top:1px solid var(--line);color:var(--ink);}

  /* bottom toolbar */

  #toolbar{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);display:flex;align-items:stretch;padding:8px 6px;z-index:5;}

  .tgroup{display:flex;flex-direction:column;align-items:center;padding:2px 14px;}

  .tgroup + .tgroup{border-left:1px solid var(--line);}

  .tlabel{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);font-weight:700;margin-bottom:6px;}

  .ticons{display:flex;gap:4px;align-items:center;}

  .ticon{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink);}

  .ticon:hover{background:#F1EFE9;}

  .ticon.active{background:var(--center-soft);color:var(--center);}

  .ticon svg{width:16px;height:16px;}

  #hint{position:absolute;bottom:96px;left:50%;transform:translateX(-50%);font-size:11.5px;color:var(--ink-soft);z-index:5;}

</style>

</head>

<body>

<div id="stage">

  <div id="topbar">

    <div class="back">&larr; Geri</div>

    <div class="center-title">

      <div>

        <span>Merkez servis</span>

        <h1 id="centerName"></h1>

      </div>

    </div>

    <input id="search" type="text" placeholder="Servis ara…">

  </div>

  <div id="legend">

    <h3>Alan (domain)</h3>

    <div id="legendBody"></div>

  </div>

  <svg id="canvas" viewBox="0 0 1700 1080" preserveAspectRatio="xMidYMid meet">

    <defs>

      <marker id="arrow" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">

        <path d="M0,0 L10,5 L0,10 Z" fill="var(--edge)"></path>

      </marker>

      <marker id="arrowHi" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">

        <path d="M0,0 L10,5 L0,10 Z" fill="var(--edge-hi)"></path>

      </marker>

    </defs>

    <g id="edgesLayer"></g>

    <g id="nodesLayer"></g>

  </svg>

  <div id="hint">Bir düğüme tıklayınca tam etiketi ve bağlantılarını sağ panelde görürsün</div>

  <div id="detail">

    <div class="dclose" onclick="closeDetail()">✕</div>

    <div id="dtag" class="dtag"></div>

    <h2 id="dname"></h2>

    <p id="dmeta"></p>

    <div class="dsub">Bağlantılar</div>

    <div id="dlinks"></div>

  </div>

  <div id="toolbar">

    <div class="tgroup">

      <div class="tlabel">Görünüm</div>

      <div class="ticons">

        <div class="ticon" title="Uzaklaştır">−</div>

        <div class="ticon" title="Yakınlaştır">+</div>

        <div class="ticon active" title="Ortala">◎</div>

      </div>

    </div>

    <div class="tgroup">

      <div class="tlabel">Katman</div>

      <div class="ticons">

        <div class="ticon" title="Önceki">‹</div>

        <div class="ticon" style="font-family:'JetBrains Mono';font-size:11px;width:auto;padding:0 8px;">2/3</div>

        <div class="ticon" title="Sonraki">›</div>

      </div>

    </div>

    <div class="tgroup">

      <div class="tlabel">İçerik</div>

      <div class="ticons">

        <div class="ticon active" title="Filtre">M</div>

      </div>

    </div>

    <div class="tgroup">

      <div class="tlabel">Kayıt / Bilgi</div>

      <div class="ticons">

        <div class="ticon" title="Kaydet">⬒</div>

        <div class="ticon" title="Bilgi">i</div>

      </div>

    </div>

  </div>

</div>

<script>

const domains = {

  identity:  {name:'Kimlik / Erişim', color:'#1F7A5C', bg:'#E4F3EC'},

  commerce:  {name:'Ticaret',         color:'var(--c-commerce)',  bg:'var(--c-commerce-bg)'},

  payments:  {name:'Ödeme',           color:'var(--c-payments)',  bg:'var(--c-payments-bg)'},

  finance:   {name:'Finans',          color:'var(--c-finance)',   bg:'var(--c-finance-bg)'},

  support:   {name:'Müşteri Desteği', color:'var(--c-support)',   bg:'var(--c-support-bg)'},

  analytics: {name:'Analitik',        color:'var(--c-analytics)', bg:'var(--c-analytics-bg)'},

  mobile:    {name:'Mobil',           color:'var(--c-mobile)',    bg:'var(--c-mobile-bg)'},

};

const center = {id:'center', label:'enterprise_identity_session_directory_access_control', domain:'identity', layer:0};

const layer1 = [

  {id:'a', angle:0,   label:'retail_checkout_order_cart_orchestration_workflow_engine', domain:'commerce'},

  {id:'b', angle:45,  label:'core_realtime_card_payment_authorization_settlement_gateway', domain:'payments'},

  {id:'c', angle:90,  label:'enterprise_operational_reporting_analytics_pipeline', domain:'analytics'},

  {id:'d', angle:135, label:'customer_support_desk_case_routing_orchestrator', domain:'support'},

  {id:'e', angle:180, label:'customer_billing_invoice_tax_reconciliation_engine', domain:'finance'},

  {id:'f', angle:225, label:'mobile_channel_backend_for_frontend_gateway_adapter', domain:'mobile'},

  {id:'g', angle:270, label:'digital_storefront_catalog_checkout_experience_api', domain:'commerce'},

  {id:'h', angle:315, label:'customer_refund_chargeback_reversal_settlement_processor', domain:'payments'},

];

const layer2 = [

  {id:'i', parent:'e', angle:200, label:'overnight_general_ledger_finance_batch_import_job_runner', domain:'finance'},

  {id:'j', parent:'d', angle:155, label:'customer_care_interaction_history_assistance_portal', domain:'support'},

  {id:'k', parent:'c', angle:115, label:'support_ticket_analytics_insight_warehouse_service', domain:'analytics'},

];

const CX=850, CY=560, R1=300, R2=490;

const rad = d => d*Math.PI/180;

layer1.forEach(n=>{ n.x = CX+R1*Math.cos(rad(n.angle)); n.y = CY+R1*Math.sin(rad(n.angle)); n.layer=1; n.parentPos={x:CX,y:CY}; });

layer2.forEach(n=>{

  n.x = CX+R2*Math.cos(rad(n.angle));

  n.y = CY+R2*Math.sin(rad(n.angle));

  n.layer=2;

  const p = layer1.find(l=>[l.id](http://l.id)===n.parent);

  n.parentPos = {x:p.x, y:p.y};

});

center.x=CX; center.y=CY;

const allNodes = [center, ...layer1, ...layer2];

function wrap(label, maxLen=17){

  const parts = label.split('_');

  const lines=[]; let cur='';

  parts.forEach((p,i)=>{

    const candidate = cur ? cur+'_'+p : p;

    if(candidate.length>maxLen && cur){ lines.push(cur+'_'); cur=p; }

    else cur=candidate;

  });

  if(cur) lines.push(cur);

  return lines;

}

const svgNS='[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)';

const edgesLayer=document.getElementById('edgesLayer');

const nodesLayer=document.getElementById('nodesLayer');

function nodeRadius(n){ return n.layer===0?24:(n.layer===1?9:7); }

function edgePath(from,to,rTo){

  const dx=to.x-from.x, dy=to.y-from.y;

  const dist=Math.hypot(dx,dy);

  const ux=dx/dist, uy=dy/dist;

  const endX = to.x - ux*(rTo+6);

  const endY = to.y - uy*(rTo+6);

  const startR = nodeRadius(from);

  const startX = from.x + ux*(startR+2);

  const startY = from.y + uy*(startR+2);

  const mx=(startX+endX)/2, my=(startY+endY)/2;

  const nx=-uy, ny=ux;

  const bow = dist*0.09;

  const cx1=mx+nx*bow, cy1=my+ny*bow;

  return `M${startX},${startY} Q${cx1},${cy1} ${endX},${endY}`;

}

const edgeEls=[], nodeEls=[];

[...layer1, ...layer2].forEach(n=>{

  const path=document.createElementNS(svgNS,'path');

  path.setAttribute('d', edgePath(n.parentPos, n, nodeRadius(n)));

  path.setAttribute('class','edge');

  path.setAttribute('marker-end','url(#arrow)');

  path.dataset.from = n.parent||'center';

  [path.dataset.to](http://path.dataset.to) = [n.id](http://n.id);

  edgesLayer.appendChild(path);

  edgeEls.push(path);

});

// center pulse rings

[0,1].forEach(i=>{

  const c=document.createElementNS(svgNS,'circle');

  c.setAttribute('cx',CX); c.setAttribute('cy',CY); c.setAttribute('r',24);

  c.setAttribute('class','center-ring');

  [c.style](http://c.style).animationDelay=(i*1.3)+'s';

  nodesLayer.appendChild(c);

});

allNodes.forEach(n=>{

  const dom = domains[n.domain];

  const g = document.createElementNS(svgNS,'g');

  g.setAttribute('class','node-group');

  [g.dataset.id](http://g.dataset.id) = [n.id](http://n.id);

  const r = nodeRadius(n);

  const dot = document.createElementNS(svgNS,'circle');

  dot.setAttribute('cx',n.x); dot.setAttribute('cy',n.y); dot.setAttribute('r',r);

  dot.setAttribute('class','node-dot');

  dot.setAttribute('fill', n.layer===0 ? 'var(--center)' : `var(${'--c-'+n.domain})`);

  dot.setAttribute('stroke', n.layer===0 ? '#fff':'#fff');

  dot.setAttribute('stroke-width', n.layer===0?3:2);

  g.appendChild(dot);

  if(n.layer>0){

    const angle=n.angle;

    const dx=Math.cos(rad(angle)), dy=Math.sin(rad(angle));

    const anchor = dx>0.35 ? 'start' : dx<-0.35 ? 'end' : 'middle';

    const gap = r+14;

    const lx = n.x + dx*gap*0 + (anchor==='start'? gap : anchor==='end'? -gap : 0);

    const ly = n.y + (anchor==='middle' ? (dy>0? gap+6 : -(gap+2)) : dy* (r+2) );

    const lines = wrap(n.label);

    const tag = document.createElementNS(svgNS,'text');

    tag.setAttribute('x', lx); tag.setAttribute('y', ly - lines.length*15.5 - 4);

    tag.setAttribute('text-anchor', anchor);

    tag.setAttribute('class','layer-tag');

    tag.textContent = (n.layer===1?'1. KATMAN':'2. KATMAN');

    g.appendChild(tag);

    const text = document.createElementNS(svgNS,'text');

    text.setAttribute('x', lx); text.setAttribute('y', ly);

    text.setAttribute('text-anchor', anchor);

    text.setAttribute('class','label-text');

    lines.forEach((line,i)=>{

      const tspan=document.createElementNS(svgNS,'tspan');

      tspan.setAttribute('x', lx);

      tspan.setAttribute('dy', i===0? 0 : 16);

      tspan.textContent=line;

      text.appendChild(tspan);

    });

    g.appendChild(text);

    n._labelLines = lines.length;

    n._labelEl = text;

    n._anchor = anchor;

    n._lx = lx; n._ly = ly;

  } else {

    const tag = document.createElementNS(svgNS,'text');

    tag.setAttribute('x', n.x); tag.setAttribute('y', n.y+r+18);

    tag.setAttribute('text-anchor','middle');

    tag.setAttribute('class','layer-tag');

    tag.textContent='MERKEZ';

    g.appendChild(tag);

  }

  [g.style](http://g.style).cursor='pointer';

  g.addEventListener('click', ()=>selectNode([n.id](http://n.id)));

  g.addEventListener('mouseenter', ()=>hoverNode([n.id](http://n.id)));

  g.addEventListener('mouseleave', ()=>hoverNode(null));

  nodesLayer.appendChild(g);

  n._g = g;

});

// draw background pills after text is measured

requestAnimationFrame(()=>{

  [...layer1,...layer2].forEach(n=>{

    const bbox = n._labelEl.getBBox();

    const pad=6;

    const rect=document.createElementNS(svgNS,'rect');

    rect.setAttribute('x', bbox.x-pad);

    rect.setAttribute('y', bbox.y-pad);

    rect.setAttribute('width', bbox.width+pad*2);

    rect.setAttribute('height', bbox.height+pad*2);

    rect.setAttribute('rx', 8);

    rect.setAttribute('fill', 'var(--bg)');

    rect.setAttribute('fill-opacity','0.92');

    rect.setAttribute('class','label-pill');

    n._g.insertBefore(rect, n._labelEl.previousSibling);

  });

});

function connections(id){

  return edgeEls.filter(e=>e.dataset.from===id||[e.dataset.to](http://e.dataset.to)===id);

}

function hoverNode(id){

  if(document.body.dataset.locked) return;

  applyFocus(id);

}

function applyFocus(id){

  if(!id){

    edgeEls.forEach(e=>e.classList.remove('dim','hi'));

    allNodes.forEach(n=>{ n._g.querySelectorAll('.node-dot,.label-pill').forEach(el=>el.classList.remove('dim')); });

    return;

  }

  const conn = connections(id).map(e=>e.dataset.from===id?[e.dataset.to](http://e.dataset.to):e.dataset.from);

  const keep = new Set([id, ...conn]);

  edgeEls.forEach(e=>{

    const on = e.dataset.from===id||[e.dataset.to](http://e.dataset.to)===id;

    e.classList.toggle('hi', on);

    e.classList.toggle('dim', !on);

    e.setAttribute('marker-end', on?'url(#arrowHi)':'url(#arrow)');

  });

  allNodes.forEach(n=>{

    const on = keep.has([n.id](http://n.id));

    n._g.querySelectorAll('.node-dot,.label-pill').forEach(el=>el.classList.toggle('dim', !on));

  });

}

function selectNode(id){

  document.body.dataset.locked='1';

  applyFocus(id);

  const n = allNodes.find(x=>[x.id](http://x.id)===id);

  const dom = domains[n.domain];

  const panel=document.getElementById('detail');

  panel.classList.add('open');

  const tag=document.getElementById('dtag');

  tag.textContent=[dom.name](http://dom.name);

  [tag.style](http://tag.style).color`var(${'--c-'+n.domain}, var(--center))`;

  [tag.style](http://tag.style).background`var(${'--c-'+n.domain+'-bg'}, var(--center-soft))`;

  if(n.layer===0){ [tag.style](http://tag.style).color='var(--center)'; [tag.style](http://tag.style).background='var(--center-soft)'; }

  document.getElementById('dname').textContent=n.label;

  document.getElementById('dmeta').textContent = n.layer===0 ? 'Merkez servis' : (n.layer+'. katman bağımlılık');

  const conn = connections(id).map(e=>e.dataset.from===id?[e.dataset.to](http://e.dataset.to):e.dataset.from);

  const linkBox=document.getElementById('dlinks');

  linkBox.innerHTML='';

  conn.forEach(cid=>{

    const cn = allNodes.find(x=>[x.id](http://x.id)===cid);

    const row=document.createElement('div');

    row.className='drow';

    row.textContent=cn.label;

    linkBox.appendChild(row);

  });

}

function closeDetail(){

  document.getElementById('detail').classList.remove('open');

  delete document.body.dataset.locked;

  applyFocus(null);

}

document.getElementById('centerName').textContent = center.label;

// legend

const legendBody=document.getElementById('legendBody');

Object.entries(domains).forEach(([key,d])=>{

  const row=document.createElement('div');

  row.className='legend-row';

  row.innerHTML = `<span class="legend-swatch" style="background:${d.color.startsWith('var')? getComputedStyle(document.documentElement).getPropertyValue(d.color.slice(4,-1)) : d.color}"></span>${d.name}`;

  legendBody.appendChild(row);

});

// search

document.getElementById('search').addEventListener('input', e=>{

  const q=[e.target](http://e.target).value.trim().toLowerCase();

  allNodes.forEach(n=>{

    if(!n._labelEl) return;

    const match = q.length>1 && n.label.toLowerCase().includes(q);

    n._labelEl.classList.toggle('match', match);

    n._g.querySelectorAll('.node-dot').forEach(el=>el.classList.toggle('dim', q.length>1 && !match));

  });

});

</script>

</body>

</html>







BUNLARI OKU : 



### 1) Radial grafikte (ilk dosya) — etiketi node'un "dışına" itiyorum

**Okun bittiği nokta, node'un tam kenarı — merkezi değil:**

js

```js
const ux = dx/dist, uy = dy/dist;           // node'a doğru birim vektör
const endX = to.x - ux*(rTo+6);              // node yarıçapı + 6px boşluk kadar önce dur
const endY = to.y - uy*(rTo+6);

```

Ok, node dairesinin merkezine değil, kenarının biraz *öncesine* çiziliyor. Yani ok geometrik olarak zaten metnin bulunduğu alana hiç girmiyor.

**Etiket, node'un daha da dışına, aynı radyal doğrultuda ama başka bir "gap" ile yerleştiriliyor:**

js

```js
const gap = r + 14;                          // node yarıçapı + 14px
const lx = n.x + (anchor==='start'? gap : anchor==='end'? -gap : 0);
```

Yani sıralama şöyle: **çizgi → boşluk → node noktası → boşluk → etiket**. Üç öğe asla aynı pikselde çakışmıyor çünkü aralarına bilinçli boşluk (gap) matematiksel olarak ekleniyor, "üst üste gelmesin" diye görsel tahminle değil.



**Metin yönü açıya göre seçiliyor** (`text-anchor`): node sağda ise etiket sağa doğru büyür, solda ise sola — böylece etiket her zaman çizginin *devamı* yönünde değil, çizginin *dışına* açılıyor.

**Etiket arka planı sonradan, gerçek metin boyutuna göre çiziliyor:**

js

```js
const bbox = n._labelEl.getBBox();            // tarayıcı metni çizdikten SONRA gerçek boyutunu ölç
rect.setAttribute('width', bbox.width+pad*2); // pill'i o boyuta göre çiz
```

Bu kritik: pill boyutunu tahmin etmiyorum, tarayıcıya gerçek metni render ettirip `getBBox()` ile gerçek genişliği/yüksekliği ölçüp arkaplanı ona göre boyutlandırıyorum. Bu yüzden hiçbir zaman metin pill'den taşmıyor.





### 2) Kart/DAG grafiğinde (sidebar'lı dosya) — kutunun boyutu metne göre büyüyor

Burada mantık ters: node zaten bir kutu (rect), o yüzden etiketi kutunun *dışına* değil *içine* koyuyorum ama **kutunun boyutunu satır sayısına göre hesaplıyorum**, sabit boyut vermiyorum:

js

```js
function cardHeight(id){ return 26 + wrap(nodes[id].label).length*15; }
```

Yani önce metni satırlara böl (`wrap`), kaç satır çıktığını say, kartın yüksekliğini o sayıya göre büyüt. 3 satırlık isim gelirse kart otomatik uzuyor — asla sabit yükseklikte kesilmiyor.

Ok da kartın **kenarına** bağlanıyor, merkezine değil:



js

```js
const sx = a.x + aw;      // kaynak kartın sağ kenarı
const ex = b.x - 6;       // hedef kartın sol kenarından 6px önce
```

### Ortak olan iki kural

1. **Satır kaydırma her zaman** `_` **karakterinden**, rastgele karakterden değil — bu yüzden `settlement_gate` gibi kelime ortasından bölünmüş çirkin kırılmalar hiç olmuyor:

js

```js
function wrap(label, maxLen){
  const parts = label.split('_');
  // her parçayı satıra ekle, maxLen aşılırsa yeni satıra geç
}
```

1. **Elips/kesme (**`...`**) hiç kullanmıyorum.** Orijinal üründe olduğu gibi `..._settlement_...` diye kesmek yerine, kutuyu/pill'i metne göre büyütüyorum. Bu yüzden tam isim her zaman görünür — sadece görünmeyen kısmı "tıkla, detay panelinde tam gör" diye ayrıca çözüyorum, ama grafikte de zaten tam metin duruyor.

Özetle: **boşluklar tahmin değil hesap** (gap matematiği + getBBox), **kutu boyutu sabit değil içerik-öncelikli** (satır sayısına göre büyüyor), **kaydırma kelime sınırına saygılı**. Bu üçü birlikte "değme" ve "sığmama" sorununu kökten çözüyor.