#!/usr/bin/env python3
"""Audit that every canonical structural box is covered by the layout-root logic.

This does not check pixel overlaps; it checks the critical invariant that no box is
allowed to disappear into an unconnected fallback row. The app also reports any
runtime fallback use in the side panel.
"""
import json, math, re, unicodedata
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
DATA_JS = ROOT / 'data' / 'league-structures.js'
OUT = ROOT / 'data' / 'layout-audit.json'

def norm(s):
    s = (s or '').lower().replace('’','').replace("'",'').replace('&',' and ')
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+',' ',s).strip()

def category(n):
    s=norm(n['label'])
    if n['kind']=='leadership': return 'leadership'
    if n['kind']=='office': return 'office'
    if n['kind']=='special': return 'special'
    if re.search(r'office|liaison|correspondent|attached',s): return 'office'
    if re.search(r'rockefeller|pension|committee|board|grant',s): return 'special'
    return 'unit'

def canonical(slide):
    raw=[n for n in slide['nodes'] if n['kind'] not in ('person','band')]
    has_office=any(norm(n['label'])=='secretary generals office' for n in raw)
    cand=[]; suppressed=[]; collapsed=[]
    for n in raw:
        if has_office and n['kind']=='leadership' and norm(n['label'])=='secretary general':
            suppressed.append({'id':n['id'],'label':n['label']})
        else: cand.append(n)
    kept=[]
    for n in cand:
        c=(n['x']+n['w']/2,n['y']+n['h']/2); key=(norm(n['label']),n['kind'])
        dup=None
        for k in kept:
            kc=(k['x']+k['w']/2,k['y']+k['h']/2)
            if (norm(k['label']),k['kind'])==key and math.hypot(c[0]-kc[0],c[1]-kc[1])<8 and abs(n['w']-k['w'])<8 and abs(n['h']-k['h'])<8:
                dup=k; break
        if dup: collapsed.append({'id':n['id'],'label':n['label'],'keptId':dup['id']})
        else: kept.append(n)
    return kept,suppressed,collapsed

def dist(px,py,n):
    l,r,t,b=n['x'],n['x']+n['w'],n['y'],n['y']+n['h']
    dx = l-px if px<l else px-r if px>r else 0
    dy = t-py if py<t else py-b if py>b else 0
    return math.hypot(dx,dy)

def near(px,py,nodes):
    best=None
    for n in nodes:
        d=dist(px,py,n)
        if d<=44 and (best is None or d<best[0]): best=(d,n)
    return best[1] if best else None

def admin_ok(parent,child):
    p=norm(parent['label']); c=norm(child['label'])
    if 'central section' not in p: return True
    return bool(re.search(r'treasury|accounting|internal control|library|attached to senior management|correspondent',c))

def relations(slide):
    nodes, suppressed, collapsed = canonical(slide)
    by={n['id']:n for n in nodes}
    links=[]; seen=set()
    def add(a,b,source='actual'):
        if not a or not b or a==b or a not in by or b not in by: return
        if source=='inferred-from-slide-position' and not admin_ok(by[a],by[b]): return
        if (a,b) not in seen:
            seen.add((a,b)); links.append((a,b,source))
    for c in slide.get('connectors',[]):
        a=near(c['x1'],c['y1'],nodes); b=near(c['x2'],c['y2'],nodes)
        if a and b and a['id']!=b['id']:
            src,tgt=(a,b) if a['y']<=b['y'] else (b,a)
            add(src['id'],tgt['id'])
    main=[n for n in nodes if category(n)=='unit' and re.search(r'section|commission|administration|treasury|library|bureau',norm(n['label']))]
    for n in nodes:
        if n['kind']=='leadership': continue
        if any(l[1]==n['id'] for l in links): continue
        lower=[m for m in main if m['id']!=n['id'] and n['y']>m['y']+45 and abs((n['x']+n['w']/2)-(m['x']+m['w']/2))<230 and admin_ok(m,n)]
        if lower:
            lower.sort(key=lambda m:abs((n['x']+n['w']/2)-(m['x']+m['w']/2)))
            add(lower[0]['id'],n['id'],'inferred-from-slide-position')
    office=next((n for n in nodes if norm(n['label'])=='secretary generals office'),None) or next((n for n in nodes if norm(n['label'])=='secretary general'),None)
    deputy=next((n for n in nodes if norm(n['label'])=='deputy secretary general'),None)
    if office and deputy: add(office['id'],deputy['id'],'implied-secretariat')
    parent={}
    for n in nodes:
        inc=[l for l in links if l[1]==n['id']]
        if not inc: continue
        inc.sort(key=lambda l:(0 if l[2]=='actual' else 90)+abs((by[l[0]]['x']+by[l[0]]['w']/2)-(n['x']+n['w']/2))+abs(n['y']-by[l[0]]['y'])*0.22)
        parent[n['id']]=inc[0][0]
    anchor=deputy or office or nodes[0]
    if anchor:
        for n in nodes:
            if n['id']==anchor['id'] or n['kind']=='leadership': continue
            if n['id'] not in parent:
                parent[n['id']]=anchor['id']; add(anchor['id'],n['id'],'top-level')
    children={n['id']:[] for n in nodes}
    for child,parent_id in parent.items():
        if parent_id in children: children[parent_id].append(child)
    return nodes,by,parent,children,suppressed,collapsed

def coverage(slide):
    nodes,by,parent,children,suppressed,collapsed=relations(slide)
    leadership={n['id'] for n in nodes if n['kind']=='leadership'}
    roots=[]
    for n in nodes:
        if n['kind']=='leadership': continue
        pid=parent.get(n['id'])
        if not pid or pid in leadership: roots.append(n['id'])
    for lid in leadership:
        for cid in children.get(lid,[]):
            if by[cid]['kind']=='leadership':
                for gcid in children.get(cid,[]):
                    if by[gcid]['kind']!='leadership': roots.append(gcid)
    roots=list(dict.fromkeys(roots))
    rootset=set(roots)
    covered=set()
    def desc(id):
        for child in children.get(id,[]):
            if child in rootset: continue
            if by[child]['kind']=='leadership': continue
            covered.add(child); desc(child)
    for rid in roots:
        covered.add(rid); desc(rid)
    nonlead=[n for n in nodes if n['kind']!='leadership']
    missing=[n for n in nonlead if n['id'] not in covered]
    return {
        'year': slide['year'],
        'canonicalStructuralBoxes': len(nodes),
        'leadershipBoxes': len([n for n in nodes if n['kind']=='leadership']),
        'nonLeadershipBoxesExpectedInClusters': len(nonlead),
        'nonLeadershipBoxesCoveredByClusters': len(covered),
        'clusterRoots': [{'id':rid,'label':by[rid]['label']} for rid in roots],
        'missingFromClusterCoverage': [{'id':n['id'],'label':n['label']} for n in missing],
        'suppressed': suppressed,
        'collapsed': collapsed,
        'status': 'PASS' if not missing else 'FAIL'
    }

def main():
    data=json.loads(DATA_JS.read_text(encoding='utf-8').split('=',1)[1].strip().rstrip(';'))
    report=[coverage(slide) for slide in data]
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    for r in report:
        print(f"{r['year']}: {r['status']} covered={r['nonLeadershipBoxesCoveredByClusters']}/{r['nonLeadershipBoxesExpectedInClusters']} roots={len(r['clusterRoots'])}")
    if any(r['status']!='PASS' for r in report):
        raise SystemExit(1)
    print(f'Wrote {OUT}')
if __name__ == '__main__': main()
