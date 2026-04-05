# LaTeX Compile Backend: assets[] Contract

This is the concrete backend contract now expected by the V2 frontend.

## Request

POST `/api/compile`

```json
{
  "latex": "\\documentclass{article} ...",
  "assets": [
    {
      "name": "figure-1.png",
      "mimeType": "image/png",
      "base64": "iVBORw0KGgoAAA..."
    }
  ]
}
```

- `latex`: required full LaTeX string
- `assets`: optional
- `assets[].name`: required safe file name used by `\includegraphics{...}`
- `assets[].mimeType`: optional, for validation/logging
- `assets[].base64`: required raw base64 file contents

## Expected backend behavior

1. Create temp work directory
2. Write `main.tex`
3. For each asset:
   - validate file name
   - base64 decode
   - write file into temp dir using `assets[].name`
4. Run XeLaTeX in that temp dir
5. Read generated PDF
6. Return:

```json
{
  "pdf_base64": "..."
}
```

## Important notes

- The frontend already emits real `\includegraphics{asset-name.ext}` calls.
- If the backend ignores `assets[]`, LaTeX will fail with missing image/file-not-found style errors.
- Current frontend image export path is optimized for:
  - PNG
  - JPG / JPEG
  - PDF

## Minimal validation

Backend should reject an asset if:
- `name` is empty
- `name` contains path traversal (`..`, `/`, `\\` outside basename intent)
- `base64` cannot be decoded

## Minimal implementation sketch

Pseudo-flow:

```text
payload = parse_json(request)
mkdir temp_dir
write temp_dir/main.tex = payload.latex
for asset in payload.assets:
  safe_name = sanitize(asset.name)
  bytes = base64_decode(asset.base64)
  write temp_dir/safe_name = bytes
run: xelatex -interaction=nonstopmode -halt-on-error main.tex
read main.pdf
return { pdf_base64 }
```

## Debug signal

If the frontend sent assets but compile still errors with missing image/file-not-found,
that almost certainly means the backend has not written `assets[]` into the compile directory yet.
