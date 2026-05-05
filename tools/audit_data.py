#!/usr/bin/env python3
"""Audit the ODP-derived data used by the constellation renderer.

The renderer is allowed to suppress only extraction artefacts explicitly documented here:
1. An isolated "Secretary-General" leadership text when "Secretary-General's Office" is also present.
2. Spatial duplicate text boxes with the same label/kind and nearly identical coordinates.

It must otherwise render every canonical structural box exactly once.
"""
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_JS = ROOT / "data" / "league-structures.js"
OUT = ROOT / "data" / "render-audit.json"


def norm(s: str) -> str:
    s = (s or "").lower().replace("’", "").replace("'", "").replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def center(n):
    return n["x"] + n["w"] / 2, n["y"] + n["h"] / 2


def canonicalize(slide):
    raw = [n for n in slide["nodes"] if n["kind"] not in ("person", "band")]
    has_office = any(norm(n["label"]) == "secretary generals office" for n in raw)
    suppressed, candidates = [], []
    for n in raw:
        if has_office and n["kind"] == "leadership" and norm(n["label"]) == "secretary general":
            suppressed.append({"id": n["id"], "label": n["label"], "reason": "suppressed extracted text because Secretary-General’s Office is present"})
        else:
            candidates.append(n)
    kept, collapsed = [], []
    for n in candidates:
        key = (norm(n["label"]), n["kind"])
        cx, cy = center(n)
        duplicate = None
        for k in kept:
            kx, ky = center(k)
            if (norm(k["label"]), k["kind"]) == key and math.hypot(cx-kx, cy-ky) < 8 and abs(n["w"]-k["w"]) < 8 and abs(n["h"]-k["h"]) < 8:
                duplicate = k
                break
        if duplicate:
            collapsed.append({"id": n["id"], "label": n["label"], "keptId": duplicate["id"], "reason": "collapsed spatial duplicate extracted from overlapping ODP text boxes"})
        else:
            kept.append(n)
    remaining = []
    groups = {}
    for n in kept:
        groups.setdefault((norm(n["label"]), n["kind"]), []).append(n)
    for (_label, kind), arr in groups.items():
        if len(arr) > 1:
            remaining.append({"label": arr[0]["label"], "kind": kind, "ids": [x["id"] for x in arr], "note": "same label appears more than once at different coordinates and is therefore kept"})
    return raw, kept, suppressed, collapsed, remaining


def main():
    text = DATA_JS.read_text(encoding="utf-8").split("=", 1)[1].strip().rstrip(";")
    data = json.loads(text)
    report = []
    for slide in data:
        raw, kept, suppressed, collapsed, remaining = canonicalize(slide)
        report.append({
            "year": slide["year"],
            "rawStructuralBoxes": len(raw),
            "canonicalBoxes": len(kept),
            "suppressed": suppressed,
            "collapsed": collapsed,
            "remainingSameLabelBoxes": remaining,
            "status": "PASS_PRE_RENDER_CANONICALIZATION",
        })
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    for r in report:
        print(f"{r['year']}: raw={r['rawStructuralBoxes']} canonical={r['canonicalBoxes']} suppressed={len(r['suppressed'])} collapsed={len(r['collapsed'])} remaining_same_label={len(r['remainingSameLabelBoxes'])}")
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()
