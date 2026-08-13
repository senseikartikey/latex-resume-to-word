# LaTeX Resume → Word

Paste LaTeX resume code, get a clean, single-column, ATS-friendly `.docx` back —
no tables, columns, or icons, just native Word headings/bullets and tab-stopped
dates. Runs entirely in the browser; nothing is uploaded anywhere.

Tuned for the RenderCV-style template family: `\section{...}`,
`\begin{twocolentry}{dates}...\end{twocolentry}`, `\begin{onecolentry}...\end{onecolentry}`,
`\begin{highlights}\item ...\end{highlights}`, `\textbf`/`\textit`. Other templates
with a similar shape (sections + itemize bullets) degrade gracefully; wildly
different templates will show a friendly error instead of a broken download.

## Files

- `index.html` / `style.css` — the page.
- `parser.js` — turns the pasted LaTeX into structured data (name, contact,
  sections, entries, bullets).
- `docxBuilder.js` — turns that structured data into a `.docx` using the
  [`docx`](https://docx.js.org) library (loaded from a CDN, no build step).
- `app.js` — wires the UI together.

## Running locally

It's fully static — serve the folder with any static file server (needed
because the extension/browser blocks `file://` access to local scripts), e.g.:

```
python -m http.server 8000
```

then open `http://localhost:8000`.

## Deploying

Push to GitHub and enable GitHub Pages on the repo (Settings → Pages → Deploy
from branch → `main` / root). No build step required.
