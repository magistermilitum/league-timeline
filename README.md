# League of Nations Organisations Timeline

Static GitHub Pages prototype generated from the supplied ODP-derived `data/league-structures.js` file.

## Run locally

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

Open a specific year:

```text
http://localhost:8000/?year=1933
```

## Data-integrity rule

The renderer is not allowed to invent, suppress, or rename historical boxes. It renders every canonical structural box from `league-structures.js`.

Two extraction artefacts are explicitly handled:

1. If `Secretary-General’s Office` exists, a separate isolated `Secretary-General` leadership label is suppressed as extracted text, not a distinct office.
2. Spatial duplicate text boxes with the same label, kind, and near-identical coordinates are collapsed and recorded in the audit report.

The browser sidebar reports the render audit for each year. The pre-render audit report is in:

```text
data/render-audit.json
```

Regenerate it with:

```bash
python3 tools/audit_data.py
```

## Interaction

- Single-click a box to display the responsible person / office holder.
- Double-click a box to pin or unpin that responsible person.
- Use `+` / `−` for the two zoom levels.
- Toggle connectors and notes from the toolbar.

## Deployment

The repository is static: `index.html`, `assets/`, and `data/` can be uploaded directly to GitHub Pages.
