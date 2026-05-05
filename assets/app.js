const DATA = window.LEAGUE_DATA;
const svg = document.getElementById('orgSvg');
const canvasWrap = document.getElementById('canvasWrap');
const slider = document.getElementById('yearSlider');
const yearReadout = document.getElementById('currentYear');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const speedSelect = document.getElementById('speedSelect');
const toggleConnectors = document.getElementById('toggleConnectors');
const toggleNotes = document.getElementById('toggleNotes');
const notesPanel = document.getElementById('notesPanel');
const notesList = document.getElementById('notesList');
const yearSummary = document.getElementById('yearSummary');
const emptyInspector = document.getElementById('emptyInspector');
const nodeInspector = document.getElementById('nodeInspector');
const nodeTitle = document.getElementById('nodeTitle');
const nodeKind = document.getElementById('nodeKind');
const nodeManager = document.getElementById('nodeManager');
const expandNodeBtn = document.getElementById('expandNodeBtn');
const fitBtn = document.getElementById('fitBtn');
const resetBtn = document.getElementById('resetBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');

const years = DATA.map(d => d.year);
const params = new URLSearchParams(window.location.search);
let currentYear = years.includes(Number(params.get('year'))) ? Number(params.get('year')) : years[0];
let timer = null;
let selectedId = null;
let pinned = new Set();
let zoomLevel = 0;
let latestLayout = null;

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs={}){
  const el = document.createElementNS(SVG_NS, name);
  for(const [k,v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}
function clearSvg(){ while(svg.firstChild) svg.removeChild(svg.firstChild); }
function dataForYear(y){ return DATA.find(d => d.year === Number(y)); }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function normalize(s){
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[’']/g,'')
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9]+/g,' ')
    .trim();
}
function estTextWidth(text,size=16){
  let w = 0;
  for(const ch of String(text || '')){
    if(ch === ' ') w += size * 0.32;
    else if(/[MW@#%&]/.test(ch)) w += size * 0.92;
    else if(/[A-Z]/.test(ch)) w += size * 0.70;
    else if(/[ijlI1\.,:;'!]/.test(ch)) w += size * 0.28;
    else if(/[\-–—()]/.test(ch)) w += size * 0.42;
    else w += size * 0.56;
  }
  return w;
}
function wrapText(text, maxWidth, size){
  const words = String(text || '').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for(const word of words){
    const trial = line ? `${line} ${word}` : word;
    if(estTextWidth(trial,size) > maxWidth && line){ lines.push(line); line = word; }
    else line = trial;
  }
  if(line) lines.push(line);
  return lines.length ? lines : [''];
}
function addText(parent, x, y, text, opts={}){
  const t = svgEl('text', {
    x, y,
    'font-size': opts.size || 14,
    'text-anchor': opts.anchor || 'middle',
    fill: opts.fill || '#152033',
    'font-weight': opts.weight || 700
  });
  t.textContent = text;
  parent.appendChild(t);
  return t;
}
function addWrapped(parent, x, y, width, text, opts={}){
  const size = opts.size || 14;
  const lineH = opts.lineH || Math.round(size * 1.18);
  const lines = wrapText(text, width, size);
  const total = lines.length * lineH;
  let yy = y - total/2 + size;
  for(const line of lines){
    addText(parent, x, yy, line, opts);
    yy += lineH;
  }
  return {lines,total};
}

// Inline SVG icons with a Lucide-like stroke grammar. No labels are inferred from icons;
// all visible historical labels come exclusively from league-structures.js.
const ICONS = {
  landmark: ['M4 10 L12 4 L20 10','M6 10 H18','M7 10 V18','M11 10 V18','M15 10 V18','M5 18 H19','M4 21 H20'],
  user: ['M12 12 A4 4 0 1 0 12 4 A4 4 0 0 0 12 12','M4 21 C5.5 16.5 18.5 16.5 20 21'],
  globe: ['M12 22 A10 10 0 1 0 12 2 A10 10 0 0 0 12 22','M2 12 H22','M12 2 C15 5.4 15 18.6 12 22','M12 2 C9 5.4 9 18.6 12 22'],
  scale: ['M7 20 H17','M12 4 V20','M5 6 H19','M6 6 L3 12 H9 L6 6','M18 6 L15 12 H21 L18 6'],
  info: ['M12 17 V11','M12 7 H12.01','M12 22 A10 10 0 1 0 12 2 A10 10 0 0 0 12 22'],
  shield: ['M12 22 C17 19 20 15 20 7 L12 4 L4 7 C4 15 7 19 12 22'],
  book: ['M4 5 C6 4 9 4 12 6 V20 C9 18 6 18 4 19 V5','M20 5 C18 4 15 4 12 6 V20 C15 18 18 18 20 19 V5'],
  chart: ['M4 19 H20','M7 16 V11','M12 16 V7','M17 16 V4'],
  train: ['M7 4 H17 C18.7 4 20 5.3 20 7 V15 C20 16.7 18.7 18 17 18 H7 C5.3 18 4 16.7 4 15 V7 C4 5.3 5.3 4 7 4','M8 22 L10 18','M16 22 L14 18','M8 9 H16','M8 14 H8.01','M16 14 H16.01'],
  heart: ['M20.4 5.6 C18.7 3.9 15.9 3.9 14.2 5.6 L12 7.8 L9.8 5.6 C8.1 3.9 5.3 3.9 3.6 5.6 C1.9 7.3 1.9 10.1 3.6 11.8 L12 20 L20.4 11.8 C22.1 10.1 22.1 7.3 20.4 5.6','M12 10 V16','M9 13 H15'],
  users: ['M17 21 V19 C17 16.8 14 15.5 12 15.5 C10 15.5 7 16.8 7 19 V21','M12 12 A4 4 0 1 0 12 4 A4 4 0 0 0 12 12','M20 21 V19.5 C20 17.9 18.8 16.8 17.2 16.2','M4 21 V19.5 C4 17.9 5.2 16.8 6.8 16.2'],
  building: ['M4 21 H20','M6 21 V7 L12 3 L18 7 V21','M9 21 V13 H15 V21','M9 9 H9.01','M15 9 H15.01'],
  link: ['M10 13 A5 5 0 0 0 17 13 L20 10 A5 5 0 0 0 13 3 L11.5 4.5','M14 11 A5 5 0 0 0 7 11 L4 14 A5 5 0 0 0 11 21 L12.5 19.5'],
  flower: ['M12 12 M8 12 A4 4 0 1 0 16 12 A4 4 0 1 0 8 12','M12 2 C15 5 15 8 12 12 C9 8 9 5 12 2','M12 22 C9 19 9 16 12 12 C15 16 15 19 12 22','M2 12 C5 9 8 9 12 12 C8 15 5 15 2 12','M22 12 C19 15 16 15 12 12 C16 9 19 9 22 12'],
  file: ['M6 3 H14 L19 8 V21 H6 Z','M14 3 V8 H19','M9 13 H15','M9 17 H15'],
  default: ['M12 7 V12 L16 14','M12 22 A10 10 0 1 0 12 2 A10 10 0 0 0 12 22']
};
function iconNameFor(node){
  const s = normalize(node.label);
  if(/deputy/.test(s)) return 'user';
  if(/secretary/.test(s)) return 'landmark';
  if(/political/.test(s)) return 'globe';
  if(/legal/.test(s)) return 'scale';
  if(/information/.test(s)) return 'info';
  if(/mandat|minorities|disarmament/.test(s)) return 'shield';
  if(/central|administrative|treasury|accounting/.test(s)) return 'building';
  if(/intellectual|library/.test(s)) return 'book';
  if(/economic|financial/.test(s)) return 'chart';
  if(/communication|transit|traffic/.test(s)) return 'train';
  if(/health/.test(s)) return 'heart';
  if(/social|women|children|staff|committee|board/.test(s)) return 'users';
  if(/office|liaison|correspondent|attached/.test(s)) return 'building';
  if(/rockefeller|grant/.test(s)) return 'flower';
  if(/opium/.test(s)) return 'file';
  return 'default';
}
function drawIcon(parent, name, cx, cy, size, color){
  const g = svgEl('g', {
    transform:`translate(${cx - size/2},${cy - size/2}) scale(${size/24})`,
    fill:'none', stroke:color, 'stroke-width':2.55, 'stroke-linecap':'round', 'stroke-linejoin':'round'
  });
  for(const d of (ICONS[name] || ICONS.default)) g.appendChild(svgEl('path',{d}));
  parent.appendChild(g);
}

function category(node){
  const s = normalize(node.label);
  if(node.kind === 'leadership') return 'leadership';
  if(node.kind === 'office') return 'office';
  if(node.kind === 'special') return 'special';
  if(/office|liaison|correspondent|attached/.test(s)) return 'office';
  if(/rockefeller|pension|committee|board|grant/.test(s)) return 'special';
  return 'unit';
}
function visualFamily(node){
  const s = normalize(node.label);
  if(category(node) === 'leadership') return 'leadership';
  if(category(node) === 'office') return 'office';
  if(category(node) === 'special') return 'special';
  if(/legal/.test(s)) return 'legal';
  if(/information/.test(s)) return 'information';
  if(/mandat|minorities|administrative/.test(s)) return 'mandates';
  if(/disarmament|communication|transit/.test(s)) return 'transit';
  if(/central/.test(s)) return 'central';
  if(/health|social|opium/.test(s)) return 'social';
  if(/economic|financial|treasury/.test(s)) return 'economic';
  return 'unit';
}
function paletteFor(node){
  const palettes = {
    leadership:{body:'#ffffff', border:'#0b1b3b', text:'#0b1b3b', icon:'#0b1b3b', tint:'#f6f8fc'},
    office:{body:'#fff8e8', border:'#dca12e', text:'#5b430a', icon:'#d59b21', tint:'#fffaf0'},
    special:{body:'#effbf6', border:'#61bd8f', text:'#14583b', icon:'#20945a', tint:'#f4fff9'},
    legal:{body:'#fbf7ff', border:'#9b62ea', text:'#4a1f82', icon:'#8f50e8', tint:'#fbf7ff'},
    information:{body:'#fff8e6', border:'#e0a30c', text:'#5f4300', icon:'#eeaa00', tint:'#fff8e6'},
    mandates:{body:'#fff4f7', border:'#ee6b91', text:'#842240', icon:'#e94d7a', tint:'#fff4f7'},
    transit:{body:'#effdff', border:'#47b7c3', text:'#075766', icon:'#1aa5b5', tint:'#effdff'},
    central:{body:'#f2fbf4', border:'#65bd79', text:'#155326', icon:'#3aa657', tint:'#f2fbf4'},
    social:{body:'#f5f8ff', border:'#7aa0ef', text:'#18356f', icon:'#3567e5', tint:'#f5f8ff'},
    economic:{body:'#f5f8ff', border:'#7aa0ef', text:'#18356f', icon:'#3567e5', tint:'#f5f8ff'},
    unit:{body:'#f5f8ff', border:'#7aa0ef', text:'#18356f', icon:'#3567e5', tint:'#f5f8ff'}
  };
  return palettes[visualFamily(node)] || palettes.unit;
}


function canonicalizeStructuralNodes(slide){
  const raw = slide.nodes.filter(n => n.kind !== 'person' && n.kind !== 'band');
  const hasOffice = raw.some(n => normalize(n.label) === 'secretary generals office');
  const suppressed = [];
  let candidates = [];
  for(const n of raw){
    // The ODP extraction often separates the words "Secretary-General" from the actual
    // "Secretary-General's Office" header. When the office box is present, the isolated
    // leadership text is treated as an extraction artefact, not as a second institution.
    if(hasOffice && n.kind === 'leadership' && normalize(n.label) === 'secretary general'){
      suppressed.push({id:n.id,label:n.label,reason:'suppressed extracted text because Secretary-General’s Office is present'});
      continue;
    }
    candidates.push(n);
  }

  const kept = [];
  const collapsed = [];
  function center(n){ return {x:n.x + n.w/2, y:n.y + n.h/2}; }
  for(const n of candidates){
    const key = `${normalize(n.label)}|${n.kind}`;
    const c = center(n);
    const duplicate = kept.find(k => {
      const kc = center(k);
      const sameKey = `${normalize(k.label)}|${k.kind}` === key;
      const veryNear = Math.hypot(c.x-kc.x, c.y-kc.y) < 8;
      const nearSameSize = Math.abs(n.w-k.w) < 8 && Math.abs(n.h-k.h) < 8;
      return sameKey && veryNear && nearSameSize;
    });
    if(duplicate){
      collapsed.push({id:n.id,label:n.label,keptId:duplicate.id,reason:'collapsed spatial duplicate extracted from overlapping ODP text boxes'});
    }else{
      kept.push(n);
    }
  }
  return {nodes:kept, audit:{sourceRawCount:raw.length, canonicalCount:kept.length, suppressed, collapsed}};
}
function structuralNodes(slide){
  return canonicalizeStructuralNodes(slide).nodes;
}
function bands(slide){ return slide.nodes.filter(n => n.kind === 'band'); }
function distanceToRect(px, py, n){
  const left=n.x, right=n.x+n.w, top=n.y, bottom=n.y+n.h;
  const dx = px<left ? left-px : px>right ? px-right : 0;
  const dy = py<top ? top-py : py>bottom ? py-bottom : 0;
  return Math.hypot(dx,dy);
}
function nodeNearRawPoint(px, py, nodes){
  let best=null;
  for(const n of nodes){
    const d = distanceToRect(px,py,n);
    if(d <= 44 && (!best || d < best.d)) best = {n,d};
  }
  return best ? best.n : null;
}
function isAdminChildCandidate(parent, child){
  const p = normalize(parent.label), c = normalize(child.label);
  if(!/central section/.test(p)) return true;
  return /treasury|accounting|internal control|library|attached to senior management|correspondent/.test(c);
}
function buildRelations(slide){
  const canonical = canonicalizeStructuralNodes(slide);
  const nodes = canonical.nodes;
  const byId = new Map(nodes.map(n => [n.id,n]));
  const links=[]; const seen=new Set();
  const add=(sourceId,targetId,source='actual')=>{
    if(!sourceId || !targetId || sourceId===targetId || !byId.has(sourceId) || !byId.has(targetId)) return;
    const sourceNode = byId.get(sourceId), targetNode = byId.get(targetId);
    if(source==='inferred-from-slide-position' && !isAdminChildCandidate(sourceNode,targetNode)) return;
    const key = `${sourceId}->${targetId}`;
    if(seen.has(key)) return;
    seen.add(key);
    links.push({sourceId,targetId,source});
  };

  for(const c of slide.connectors || []){
    const a=nodeNearRawPoint(c.x1,c.y1,nodes);
    const b=nodeNearRawPoint(c.x2,c.y2,nodes);
    if(a && b && a.id!==b.id){
      const source = a.y <= b.y ? a : b;
      const target = a.y <= b.y ? b : a;
      add(source.id,target.id,'actual');
    }
  }

  const mainCandidates = nodes.filter(n => category(n)==='unit' && /section|commission|administration|treasury|library|bureau/.test(normalize(n.label)));
  for(const n of nodes){
    if(n.kind === 'leadership') continue;
    const hasIncoming = links.some(l => l.targetId === n.id);
    if(hasIncoming) continue;
    const lower = mainCandidates.filter(m => m.id!==n.id && n.y > m.y + 45 && Math.abs((n.x+n.w/2)-(m.x+m.w/2)) < 230 && isAdminChildCandidate(m,n));
    if(lower.length){
      lower.sort((a,b)=>Math.abs((n.x+n.w/2)-(a.x+a.w/2))-Math.abs((n.x+n.w/2)-(b.x+b.w/2)));
      add(lower[0].id,n.id,'inferred-from-slide-position');
    }
  }

  const office = nodes.find(n => normalize(n.label)==='secretary generals office') || nodes.find(n => normalize(n.label)==='secretary general');
  const deputy = nodes.find(n => normalize(n.label)==='deputy secretary general');
  if(office && deputy) add(office.id,deputy.id,'implied-secretariat');

  const parent = new Map();
  for(const n of nodes){
    const incoming = links.filter(l => l.targetId===n.id);
    if(!incoming.length) continue;
    incoming.sort((la,lb)=>{
      const a=byId.get(la.sourceId), b=byId.get(lb.sourceId);
      const sa = (la.source==='actual'?0:90) + Math.abs((a.x+a.w/2)-(n.x+n.w/2)) + Math.abs(n.y-a.y)*0.22;
      const sb = (lb.source==='actual'?0:90) + Math.abs((b.x+b.w/2)-(n.x+n.w/2)) + Math.abs(n.y-b.y)*0.22;
      return sa-sb;
    });
    parent.set(n.id,incoming[0].sourceId);
  }
  const anchor = deputy || office || nodes[0];
  if(anchor){
    for(const n of nodes){
      if(n.id===anchor.id || n.kind==='leadership') continue;
      if(!parent.has(n.id)){
        parent.set(n.id,anchor.id);
        add(anchor.id,n.id,'top-level');
      }
    }
  }
  const children = new Map(nodes.map(n => [n.id, []]));
  for(const [childId,parentId] of parent.entries()){
    if(children.has(parentId)) children.get(parentId).push(childId);
  }
  for(const arr of children.values()) arr.sort((a,b)=>byId.get(a).x-byId.get(b).x);
  return {nodes,byId,links,parent,children,office,deputy,anchor,audit:canonical.audit};
}
function descendantsOf(id, children, byId, out=[]){
  for(const child of (children.get(id)||[])){
    out.push(byId.get(child));
    descendantsOf(child, children, byId, out);
  }
  return out;
}
function buildClusters(model){
  // A cluster root is every non-leadership box whose parent is either a leadership
  // node (Secretary-General's Office / Deputy Secretary-General) or absent. This is
  // deliberately broader than “children of Deputy Secretary-General”: in the ODP,
  // many years connect some sections directly to the Secretary-General's Office,
  // while others route them through the Deputy. Both are top-level sections in the
  // rendered constellation and must not fall through to the audit safety net.
  const leadershipIds = new Set(model.nodes.filter(n => n.kind === 'leadership').map(n => n.id));
  const rootIds = [];
  for(const n of model.nodes){
    if(n.kind === 'leadership') continue;
    const pid = model.parent.get(n.id);
    if(!pid || leadershipIds.has(pid)) rootIds.push(n.id);
  }

  // If a leadership node has another leadership child, include that child’s
  // non-leadership children too. This covers Office -> Deputy -> Sections without
  // losing sections connected to Office directly.
  for(const lid of leadershipIds){
    for(const childId of (model.children.get(lid) || [])){
      const child = model.byId.get(childId);
      if(child?.kind === 'leadership'){
        for(const grandChildId of (model.children.get(childId) || [])){
          const gc = model.byId.get(grandChildId);
          if(gc && gc.kind !== 'leadership') rootIds.push(grandChildId);
        }
      }
    }
  }

  const uniqueRootIds = [...new Set(rootIds)].filter(id => model.byId.has(id));
  const rootSet = new Set(uniqueRootIds);
  function descendantsWithinCluster(id, out=[]){
    for(const child of (model.children.get(id) || [])){
      if(rootSet.has(child)) continue; // avoid re-rendering another top-level cluster inside this cluster
      const node = model.byId.get(child);
      if(!node || node.kind === 'leadership') continue;
      out.push(node);
      descendantsWithinCluster(child, out);
    }
    return out;
  }
  const clusters = uniqueRootIds.map(id => ({node:model.byId.get(id), items:descendantsWithinCluster(id, [])}));

  const left=[], right=[], middle=[], bottom=[];
  for(const c of clusters){
    const s = normalize(c.node.label);
    const cat = category(c.node);
    if(cat === 'office' || cat === 'special' || /branch|liaison|correspondent|attached/.test(s)) bottom.push(c);
    else if(/political|legal|central|administrative|minorities/.test(s)) left.push(c);
    else if(/information|mandat|disarm/.test(s)) right.push(c);
    else middle.push(c);
  }
  left.sort((a,b)=>a.node.y-b.node.y || a.node.x-b.node.x);
  right.sort((a,b)=>a.node.y-b.node.y || a.node.x-b.node.x);
  middle.sort((a,b)=>a.node.x-b.node.x);
  bottom.sort((a,b)=>a.node.x-b.node.x);
  return {left,right,middle,bottom,all:clusters};
}

function measureBox(label, role='header', maxWidth=230){
  const size = role==='pill' ? 12.5 : 15;
  const lines = wrapText(label, maxWidth - 58, size);
  const lineH = role==='pill' ? 15 : 17;
  const width = role==='pill' ? maxWidth : clamp(Math.max(176, Math.max(...lines.map(l=>estTextWidth(l,size))) + 84), 176, maxWidth);
  const height = role==='pill' ? Math.max(38, 27 + (lines.length-1)*15) : Math.max(54, 42 + (lines.length-1)*16);
  return {width,height,lines,size,lineH};
}
function measureCluster(cluster, preferred='side'){
  const hasItems = cluster.items.length > 0;
  const headerM = measureBox(cluster.node.label, 'header', preferred==='bottom'?290:255);
  if(!hasItems) return {w:headerM.width, h:headerM.height, header:headerM, rows:[], shell:false};
  const cols = cluster.items.length >= 5 ? 2 : 1;
  const pillW = cols === 2 ? 128 : Math.min(215, Math.max(166, headerM.width - 28));
  const rows=[];
  for(let i=0;i<cluster.items.length;i+=cols){
    rows.push(cluster.items.slice(i,i+cols).map(node => ({node, m:measureBox(node.label,'pill',pillW)})));
  }
  const rowHeights = rows.map(row => Math.max(...row.map(p=>p.m.height)));
  const bodyH = rowHeights.reduce((a,b)=>a+b,0) + Math.max(0,rows.length-1)*8 + 14;
  const w = Math.max(headerM.width + 28, cols*pillW + (cols-1)*10 + 32);
  const h = headerM.height + bodyH + 28;
  return {w,h,header:headerM,rows,rowHeights,pillW,cols,shell:true};
}
function computeBusConnectors(connectors, placements, hub, busY, soft=true){
  if(!placements.length) return;
  const xs = placements.map(p => p.cx);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  connectors.push({d:`M ${hub.x} ${hub.y} L ${hub.x} ${busY}`, soft});
  if(Math.abs(maxX-minX)>4) connectors.push({d:`M ${minX} ${busY} L ${maxX} ${busY}`, soft});
  for(const p of placements){
    connectors.push({d:`M ${p.cx} ${busY} L ${p.cx} ${p.cy}`, soft});
  }
}

function resolveBoxOverlaps(boxes, shells){
  // Conservative post-pass: only nudges lower non-leadership boxes downward.
  // It never removes or renames nodes; it only creates a little breathing room.
  const leadIds = new Set(boxes.filter(b => b.kind === 'leadership').map(b => b.id));
  const sorted = boxes.filter(b => !leadIds.has(b.id)).sort((a,b)=>(a.y-b.y)||(a.x-b.x));
  const pad = 10;
  for(let pass=0; pass<4; pass++){
    let moved = false;
    for(let i=0;i<sorted.length;i++){
      const a = sorted[i];
      for(let j=i+1;j<sorted.length;j++){
        const b = sorted[j];
        if(b.y > a.y + a.h + 80) break;
        const overlapX = Math.min(a.x+a.w, b.x+b.w) - Math.max(a.x,b.x);
        const overlapY = Math.min(a.y+a.h, b.y+b.h) - Math.max(a.y,b.y);
        if(overlapX > 0 && overlapY > 0){
          const shift = overlapY + pad;
          b.y += shift;
          moved = true;
        }
      }
    }
    if(!moved) break;
  }
  // Expand nearby shells so nudged child boxes remain inside their visual cluster.
  for(const sh of shells){
    const contained = boxes.filter(b => b.x >= sh.x - 4 && b.x + b.w <= sh.x + sh.w + 4 && b.y >= sh.y - 4 && b.y <= sh.y + sh.h + 90);
    if(!contained.length) continue;
    const maxB = Math.max(...contained.map(b => b.y + b.h));
    if(maxB + 14 > sh.y + sh.h) sh.h = maxB - sh.y + 18;
  }
}

function makeLayout(slide){
  const model = buildRelations(slide);
  const clusters = buildClusters(model);
  const W=1400;
  const boxes=[], shells=[], connectors=[], labels=[];
  const office=model.office || model.anchor;
  const deputy=model.deputy || model.anchor;

  labels.push({type:'caption',x:20,y:22,w:500,h:44,text:`${currentYear} — Hub-and-spoke constellation`});
  if(office) boxes.push({id:office.id,node:office,kind:'leadership',role:'lead',x:558,y:48,w:284,h:90,label:office.label});
  if(deputy) boxes.push({id:deputy.id,node:deputy,kind:'leadership',role:'lead-small',x:570,y:178,w:260,h:64,label:deputy.label});
  if(office && deputy) connectors.push({d:'M 700 138 L 700 178'});
  const hub = {x:700,y:242};

  function placeCluster(cluster,x,y,zone='side', connectMode='curve'){
    const m = measureCluster(cluster, zone);
    if(m.shell) shells.push({x,y,w:m.w,h:m.h,soft:true});
    const headX = m.shell ? x+13 : x;
    const headY = m.shell ? y+12 : y;
    const headW = m.shell ? m.w-26 : m.w;
    boxes.push({id:cluster.node.id,node:cluster.node,kind:category(cluster.node),role:'header',x:headX,y:headY,w:headW,h:m.header.height,label:cluster.node.label});
    if(connectMode==='curve') connectors.push({d:`M ${hub.x} ${hub.y} C ${hub.x} ${(hub.y+headY)/2}, ${headX+headW/2} ${(hub.y+headY)/2}, ${headX+headW/2} ${headY}`, soft:true});
    if(m.shell){
      let yy = y + 22 + m.header.height;
      m.rows.forEach((row,ri)=>{
        const totalW = row.reduce((s,p)=>s+p.m.width,0)+(row.length-1)*10;
        let xx = x + (m.w-totalW)/2;
        const rowH = m.rowHeights[ri];
        row.forEach(p=>{
          boxes.push({id:p.node.id,node:p.node,kind:category(p.node),role:'pill',x:xx,y:yy+(rowH-p.m.height)/2,w:p.m.width,h:p.m.height,label:p.node.label});
          xx += p.m.width + 10;
        });
        yy += rowH + 8;
      });
    }
    return {x,y,w:m.w,h:m.h,cx:headX+headW/2,cy:headY,headerBottom:headY+m.header.height};
  }

  let yLeft=94; const leftPlacements=[];
  clusters.left.forEach(c=>{
    const m=measureCluster(c,'side');
    leftPlacements.push(placeCluster(c, 88, yLeft, 'side', 'curve'));
    yLeft += m.h + 22;
  });
  let yRight=94; const rightPlacements=[];
  clusters.right.forEach(c=>{
    const m=measureCluster(c,'side');
    rightPlacements.push(placeCluster(c, W - 88 - m.w, yRight, 'side', 'curve'));
    yRight += m.h + 22;
  });

  const mid = clusters.middle;
  const midGeoms = mid.map(c=>measureCluster(c,'middle'));
  const midRows = [];
  let row=[], rowW=0;
  mid.forEach((c,i)=>{
    const g=midGeoms[i];
    const next = row.length ? rowW + 18 + g.w : g.w;
    if(row.length && next > 940){ midRows.push(row); row=[i]; rowW=g.w; }
    else { row.push(i); rowW=next; }
  });
  if(row.length) midRows.push(row);
  let yMid = 470; const midPlacementsByRow=[];
  midRows.forEach((rowIdxs,rowNo)=>{
    const total = rowIdxs.reduce((s,i,k)=>s+midGeoms[i].w+(k?18:0),0);
    let xx = (W-total)/2;
    const rowH = Math.max(...rowIdxs.map(i=>midGeoms[i].h));
    const placements=[];
    rowIdxs.forEach(i=>{
      const p = placeCluster(mid[i], xx, yMid + (rowH-midGeoms[i].h)/2, 'middle', 'none');
      placements.push(p);
      xx += midGeoms[i].w + 18;
    });
    computeBusConnectors(connectors, placements, {x:hub.x,y: rowNo===0 ? hub.y : yMid-35}, yMid - 22, true);
    midPlacementsByRow.push(placements);
    yMid += rowH + 26;
  });

  const bottom = clusters.bottom;
  let yBottom = Math.max(yLeft, yRight, yMid + 20, 760);
  const bottomPlacements=[];
  if(bottom.length){
    const geoms = bottom.map(c=>measureCluster(c,'bottom'));
    let brow=[]; let browW=0; const rows=[];
    bottom.forEach((c,i)=>{
      const g=geoms[i];
      const next=brow.length ? browW + 20 + g.w : g.w;
      if(brow.length && next > 970){ rows.push(brow); brow=[i]; browW=g.w; }
      else { brow.push(i); browW=next; }
    });
    if(brow.length) rows.push(brow);
    rows.forEach(rowIdxs=>{
      const total=rowIdxs.reduce((s,i,k)=>s+geoms[i].w+(k?20:0),0);
      let xx=(W-total)/2;
      const rh=Math.max(...rowIdxs.map(i=>geoms[i].h));
      const placements=[];
      rowIdxs.forEach(i=>{
        const c=bottom[i], g=geoms[i];
        const p = placeCluster(c, xx, yBottom+(rh-g.h)/2, 'bottom', 'none');
        placements.push(p); bottomPlacements.push(p);
        xx += g.w + 20;
      });
      computeBusConnectors(connectors, placements, {x:700,y:yBottom-40}, yBottom-18, true);
      connectors[connectors.length-1].dotted = true;
      yBottom += rh + 20;
    });
  }

  resolveBoxOverlaps(boxes, shells);

  const renderedIds = new Set(boxes.map(b => b.id));
  const sourceIds = new Set(model.nodes.map(n => n.id));
  const missing = model.nodes.filter(n => !renderedIds.has(n.id));
  const unexpected = boxes.filter(b => b.node && !sourceIds.has(b.id)).map(b => ({id:b.id,label:b.label}));
  let fallbackCount = 0;
  if(missing.length){
    // Last-resort safety net: a source node is never silently omitted. If the layout logic
    // fails to place a source box, it is added as an audited standalone box at the bottom.
    // Any use of this path is reported as WARN, not PASS.
    let fx = 84;
    let fy = Math.max(yLeft, yRight, yMid, yBottom) + 36;
    for(const n of missing){
      const m = measureBox(n.label, 'header', 265);
      if(fx + m.width > W - 80){ fx = 84; fy += 74; }
      boxes.push({id:n.id,node:n,kind:category(n),role:'header',x:fx,y:fy,w:m.width,h:m.height,label:n.label,auditFallback:true});
      fallbackCount += 1;
      fx += m.width + 18;
    }
  }
  const renderedIdsAfterFallback = new Set(boxes.map(b => b.id));
  const audit = {
    ...model.audit,
    expectedRenderedIds:[...sourceIds],
    renderedIds:[...renderedIdsAfterFallback].filter(id => sourceIds.has(id)),
    missingAfterFallback:model.nodes.filter(n => !renderedIdsAfterFallback.has(n.id)).map(n => ({id:n.id,label:n.label})),
    unexpected,
    fallbackCount,
    status:(!model.nodes.every(n => renderedIdsAfterFallback.has(n.id)) || unexpected.length>0) ? 'FAIL' : (fallbackCount>0 ? 'WARN' : 'PASS')
  };

  // Visual legend: this is not a data category assignment; it explains border semantics.
  const legendY = Math.max(yBottom + 4, 930);
  labels.push({type:'legend',x:42,y:legendY,w:300,h:34,text:'General organisations / sections',kind:'general'});
  labels.push({type:'legend',x:42,y:legendY+42,w:300,h:34,text:'Sub-offices / liaison / branches',kind:'office'});
  labels.push({type:'legend',x:42,y:legendY+84,w:300,h:34,text:'Special organisations / funds',kind:'special'});

  const maxBoxBottom = Math.max(...boxes.map(b=>b.y+b.h), legendY+118);
  const H = Math.max(1000, maxBoxBottom + 50);
  return {W,H,boxes,shells,connectors,labels,model,clusters,audit};
}

function renderConnector(parent,c){ parent.appendChild(svgEl('path',{d:c.d,class:`connector${c.soft?' soft':''}${c.dotted?' dotted':''}`})); }
function renderShell(parent,s){ parent.appendChild(svgEl('rect',{x:s.x,y:s.y,width:s.w,height:s.h,rx:22,ry:22,class:`cluster-shell${s.soft?' soft':''}`})); }
function renderLabel(parent,l){
  if(l.type==='caption'){
    const g=svgEl('g',{class:'legend-chip'});
    g.appendChild(svgEl('rect',{x:l.x,y:l.y,width:l.w,height:l.h,rx:14,ry:14}));
    addText(g,l.x+16,l.y+29,l.text,{anchor:'start',size:18,weight:850,fill:'#10264c'});
    parent.appendChild(g); return;
  }
  if(l.type==='legend'){
    const g=svgEl('g',{class:`legend-chip ${l.kind}`});
    g.appendChild(svgEl('rect',{x:l.x,y:l.y,width:l.w,height:l.h,rx:14,ry:14}));
    const dotColor = l.kind==='special' ? '#20945a' : (l.kind==='office' ? '#d59b21' : '#3567e5');
    g.appendChild(svgEl('circle',{cx:l.x+20,cy:l.y+17,r:6,fill:dotColor}));
    addText(g,l.x+38,l.y+22,l.text,{anchor:'start',size:13,weight:750,fill:'#305070'});
    parent.appendChild(g); return;
  }
}
function renderBox(parent,box){
  const pal=paletteFor(box.node || {label:box.label,kind:box.kind});
  const isLead=box.kind==='leadership';
  const isDeputy = isLead && /deputy/.test(normalize(box.label));
  const fill = isLead ? '#ffffff' : (box.role==='header' ? pal.body : '#fff');
  const stroke = isLead ? '#0b1b3b' : pal.border;
  const leadIconColor = isDeputy ? '#2f57d7' : '#0b1b3b';
  const g=svgEl('g',{class:`box ${box.kind} ${box.role}${selectedId===box.id?' selected':''}${category(box.node)==='special'?' special-border':''}`,'data-id':box.id});
  const rectAttrs = {x:box.x,y:box.y,width:box.w,height:box.h,rx:box.role==='pill'?10:16,ry:box.role==='pill'?10:16,fill,stroke};
  if(category(box.node)==='special') rectAttrs['stroke-dasharray'] = box.role==='pill' ? '5 4' : '7 5';
  if(isLead) rectAttrs['stroke-width'] = box.role==='lead' ? 3.2 : 2.4;
  g.appendChild(svgEl('rect',rectAttrs));
  const textColor = isLead ? '#0b1b3b' : pal.text;
  let textX=box.x+box.w/2, maxW=box.w-28;
  const size = box.role==='pill' ? 12.2 : (isLead ? 17 : 14.5);
  const weight = box.role==='pill' ? 700 : 820;
  const iconName = iconNameFor(box.node || {label:box.label});
  if(iconName && box.role !== 'pill'){
    const token = isLead ? 46 : 40;
    const cx = box.x + (isLead ? 36 : 32), cy = box.y + box.h/2;
    g.appendChild(svgEl('circle',{cx,cy,r:token/2,class:'icon-circle',fill:pal.tint || '#fff'}));
    drawIcon(g, iconName, cx, cy, isLead ? 31 : 27, isLead ? leadIconColor : (pal.icon || stroke));
    textX = box.x + box.w/2 + (isLead ? 22 : 16);
    maxW = box.w - (isLead ? 98 : 82);
  }
  addWrapped(g,textX,box.y+box.h/2,maxW,box.label,{size,weight,fill:textColor,lineH:box.role==='pill'?14.5:17});
  g.addEventListener('click', ev=>{ev.stopPropagation(); selectedId=box.id; render();});
  g.addEventListener('dblclick', ev=>{ev.stopPropagation(); if(pinned.has(box.id)) pinned.delete(box.id); else pinned.add(box.id); selectedId=box.id; render();});
  parent.appendChild(g);
}
function renderManagerBadge(parent,box){
  if(!(selectedId===box.id || pinned.has(box.id))) return;
  const manager=box.node?.manager;
  if(!manager) return;
  const w=clamp(estTextWidth(manager,12)+26,120,310);
  const h=28, x=box.x+box.w/2-w/2, y=box.y-h-10;
  const g=svgEl('g',{class:'manager-badge'});
  g.appendChild(svgEl('rect',{x,y,width:w,height:h,rx:14,ry:14}));
  addWrapped(g,x+w/2,y+h/2,w-20,manager,{size:12,weight:750,fill:'#2354d6',lineH:13});
  parent.appendChild(g);
}
function applyViewBox(layout){
  if(zoomLevel===0) svg.setAttribute('viewBox',`0 0 ${layout.W} ${layout.H}`);
  else svg.setAttribute('viewBox',`110 80 ${layout.W-220} ${layout.H-160}`);
  // Adapt the viewport height to tall years instead of clipping the lower part.
  const ratio = layout.H / layout.W;
  const availableW = canvasWrap.clientWidth || 1000;
  const desired = clamp(availableW * ratio, 660, 1120);
  canvasWrap.style.height = `${desired}px`;
}
function render(){
  const slide=dataForYear(currentYear); if(!slide) return;
  clearSvg();
  yearReadout.textContent=currentYear; slider.value=currentYear;
  const layout=makeLayout(slide); latestLayout=layout;
  svg.setAttribute('preserveAspectRatio','xMidYMid meet');
  applyViewBox(layout);

  const labelG=svgEl('g'); layout.labels.forEach(l=>renderLabel(labelG,l)); svg.appendChild(labelG);
  if(toggleConnectors.checked){ const cg=svgEl('g'); layout.connectors.forEach(c=>renderConnector(cg,c)); svg.appendChild(cg); }
  const sg=svgEl('g'); layout.shells.forEach(s=>renderShell(sg,s)); svg.appendChild(sg);
  const bg=svgEl('g'); layout.boxes.forEach(b=>renderBox(bg,b)); svg.appendChild(bg);
  const mg=svgEl('g'); layout.boxes.forEach(b=>renderManagerBadge(mg,b)); svg.appendChild(mg);

  svg.onclick=()=>{selectedId=null; render();};
  renderSidePanel(slide, layout);
}
function renderSidePanel(slide, layout){
  yearSummary.textContent = `${slide.year}: audit ${layout.audit?.status || 'UNKNOWN'} — ${layout.audit?.renderedIds?.length || 0}/${layout.audit?.expectedRenderedIds?.length || 0} canonical ODP boxes rendered; fallback boxes: ${layout.audit?.fallbackCount || 0}. Central Section is treated as a coordination/internal-administration section, not as the parent of all sections.`;
  notesList.innerHTML='';
  for(const note of slide.notes || []){
    const li=document.createElement('li'); li.textContent=note; notesList.appendChild(li);
  }
  notesPanel.style.display = toggleNotes.checked ? '' : 'none';
  const node = slide.nodes.find(n => n.id===selectedId);
  if(node){
    emptyInspector.hidden=true; nodeInspector.hidden=false;
    nodeKind.textContent=category(node);
    nodeTitle.textContent=node.label;
    nodeManager.textContent=node.manager ? `Responsible / office holder: ${node.manager}` : 'No responsible person identified in the extracted data.';
    expandNodeBtn.textContent=pinned.has(node.id)?'Unpin name':'Pin name';
  } else {
    emptyInspector.hidden=false; nodeInspector.hidden=true;
  }
}
function moveYear(delta){
  const idx=years.indexOf(currentYear);
  currentYear=years[clamp(idx+delta,0,years.length-1)];
  selectedId=null; render();
}
function play(){
  if(timer){ clearInterval(timer); timer=null; playBtn.textContent='▶'; return; }
  playBtn.textContent='❚❚';
  timer=setInterval(()=>{
    const idx=years.indexOf(currentYear);
    if(idx>=years.length-1){ clearInterval(timer); timer=null; playBtn.textContent='▶'; return; }
    currentYear=years[idx+1]; selectedId=null; render();
  }, Number(speedSelect.value));
}

prevBtn.addEventListener('click',()=>moveYear(-1));
nextBtn.addEventListener('click',()=>moveYear(1));
playBtn.addEventListener('click',play);
slider.addEventListener('input',e=>{currentYear=Number(e.target.value); selectedId=null; render();});
speedSelect.addEventListener('change',()=>{ if(timer){ clearInterval(timer); timer=null; play(); }});
toggleConnectors.addEventListener('change',render);
toggleNotes.addEventListener('change',()=>renderSidePanel(dataForYear(currentYear), latestLayout));
expandNodeBtn.addEventListener('click',()=>{ if(!selectedId) return; if(pinned.has(selectedId)) pinned.delete(selectedId); else pinned.add(selectedId); render(); });
zoomInBtn.addEventListener('click',()=>{ zoomLevel=1; zoomInBtn.classList.add('active'); zoomOutBtn.classList.remove('active'); if(latestLayout) applyViewBox(latestLayout); });
zoomOutBtn.addEventListener('click',()=>{ zoomLevel=0; zoomOutBtn.classList.add('active'); zoomInBtn.classList.remove('active'); if(latestLayout) applyViewBox(latestLayout); });
fitBtn.addEventListener('click',()=>{ zoomLevel=0; zoomOutBtn.classList.add('active'); zoomInBtn.classList.remove('active'); if(latestLayout) applyViewBox(latestLayout); });
resetBtn.addEventListener('click',()=>{ pinned=new Set(); selectedId=null; render(); });
window.addEventListener('resize',()=>{ if(latestLayout) applyViewBox(latestLayout); });

render();
