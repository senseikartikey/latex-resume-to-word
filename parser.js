// Regex/scan-based parser for the RenderCV-style LaTeX resume template family:
// \section{...}, \begin{twocolentry}{dates}...\end{twocolentry},
// \begin{onecolentry}...\end{onecolentry}, \begin{highlights}\item ...\end{highlights},
// \textbf/\textit, \href/\hrefWithoutArrow.
//
// Produces: { name: string, contact: string, sections: [{ title, entries }] }
// entry shapes:
//   { type: 'entry', left: string, right: string, subheader: runs|null, bullets: runs[] }
//   { type: 'line', runs }               -- e.g. "Label: value" skills lines
//   { type: 'bullets', bullets: runs[] } -- fallback, heading-less bullet list
// where `runs` is an array of { text, bold, italic }.

function stripComments(latex) {
  return latex.replace(/(^|[^\\])%.*$/gm, '$1');
}

function extractBody(latex) {
  const beginTag = '\\begin{document}';
  const endTag = '\\end{document}';
  const bStart = latex.indexOf(beginTag);
  if (bStart === -1) return latex;
  const start = bStart + beginTag.length;
  const bEnd = latex.indexOf(endTag, start);
  return latex.slice(start, bEnd === -1 ? undefined : bEnd);
}

function findMatchingBrace(str, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractArg(str, fromIdx) {
  let i = fromIdx;
  while (i < str.length && /\s/.test(str[i])) i++;
  if (str[i] !== '{') return null;
  const close = findMatchingBrace(str, i);
  if (close === -1) return null;
  return { content: str.slice(i + 1, close), start: i, end: close };
}

// Turns a LaTeX snippet into an array of { text, bold, italic } runs.
// Recognizes \textbf/\textit (nested), \href/\hrefWithoutArrow (keeps visible text,
// drops the URL), \\ (rendered as " | "), common escapes, and en/em dashes.
// Any other command is dropped along with its immediately-adjacent {..}/[..]
// argument groups -- a generic fallback that neutralizes icons, spacing, color,
// and font commands without needing to know each one by name.
function parseInline(latex) {
  const runs = [];
  let buffer = '';
  let i = 0;
  const n = latex.length;

  function flush() {
    if (buffer.length) {
      runs.push({ text: buffer, bold: false, italic: false });
      buffer = '';
    }
  }

  function pushRuns(subRuns, bold, italic, url) {
    for (const r of subRuns) {
      const run = { text: r.text, bold: r.bold || bold, italic: r.italic || italic };
      const finalUrl = url || r.url;
      if (finalUrl) run.url = finalUrl;
      runs.push(run);
    }
  }

  const escMap = { '%': '%', '&': '&', '#': '#', $: '$', _: '_', '{': '{', '}': '}' };

  while (i < n) {
    const ch = latex[i];

    if (ch === '\\') {
      if (latex[i + 1] === '\\') {
        flush();
        runs.push({ text: ' | ', bold: false, italic: false });
        i += 2;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(escMap, latex[i + 1])) {
        buffer += escMap[latex[i + 1]];
        i += 2;
        continue;
      }
      const cmdMatch = latex.slice(i).match(/^\\([a-zA-Z]+)(\*)?/);
      if (cmdMatch) {
        const cmdName = cmdMatch[1];
        const cmdEnd = i + cmdMatch[0].length;

        if (cmdName === 'textbf' || cmdName === 'textit') {
          const arg = extractArg(latex, cmdEnd);
          if (arg) {
            flush();
            pushRuns(parseInline(arg.content), cmdName === 'textbf', cmdName === 'textit');
            i = arg.end + 1;
            continue;
          }
        } else if (cmdName === 'hrefWithoutArrow' || cmdName === 'href') {
          const urlArg = extractArg(latex, cmdEnd);
          if (urlArg) {
            const textArg = extractArg(latex, urlArg.end + 1);
            if (textArg) {
              flush();
              pushRuns(parseInline(textArg.content), false, false, urlArg.content.trim());
              i = textArg.end + 1;
              continue;
            }
          }
        } else if (cmdName === 'textendash') {
          buffer += '–';
          i = cmdEnd;
          continue;
        } else if (cmdName === 'textemdash') {
          buffer += '—';
          i = cmdEnd;
          continue;
        }

        // Generic unknown command: drop it and any immediately-adjacent {..}/[..] args.
        let j = cmdEnd;
        while (j < n) {
          if (latex[j] === '{') {
            const close = findMatchingBrace(latex, j);
            if (close === -1) break;
            j = close + 1;
            continue;
          }
          if (latex[j] === '[') {
            const close = latex.indexOf(']', j);
            if (close === -1) break;
            j = close + 1;
            continue;
          }
          break;
        }
        i = j;
        continue;
      }
      i += 1; // lone backslash
      continue;
    }

    if (ch === '{' || ch === '}') {
      i += 1; // stray grouping brace, drop it, keep scanning its contents inline
      continue;
    }

    if (ch === '-' && latex[i + 1] === '-') {
      buffer += '–';
      i += 2;
      continue;
    }

    if (ch === '~') {
      buffer += ' ';
      i += 1;
      continue;
    }

    buffer += ch;
    i += 1;
  }
  flush();

  const cleaned = runs
    .map((r) => ({ ...r, text: r.text.replace(/[ \t\r\n]+/g, ' ') }))
    .filter((r) => r.text.length > 0);

  const merged = [];
  for (const r of cleaned) {
    const last = merged[merged.length - 1];
    if (last && last.bold === r.bold && last.italic === r.italic && last.url === r.url) {
      last.text += r.text;
    } else {
      merged.push({ ...r });
    }
  }

  if (merged.length) {
    merged[0].text = merged[0].text.replace(/^ /, '');
    merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/ $/, '');
  }

  return merged.filter((r) => r.text.length > 0);
}

function flattenText(runs) {
  return runs
    .map((r) => r.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function findEnvBlocks(text, envName, hasArg) {
  const blocks = [];
  const beginTag = `\\begin{${envName}}`;
  const endTag = `\\end{${envName}}`;
  let idx = 0;
  while (true) {
    const start = text.indexOf(beginTag, idx);
    if (start === -1) break;
    let cursor = start + beginTag.length;
    let arg = null;
    if (hasArg) {
      const a = extractArg(text, cursor);
      if (a) {
        arg = a.content;
        cursor = a.end + 1;
      }
    }
    const end = text.indexOf(endTag, cursor);
    if (end === -1) break;
    blocks.push({ arg, content: text.slice(cursor, end), start, end: end + endTag.length });
    idx = end + endTag.length;
  }
  return blocks;
}

function extractItems(highlightsContent) {
  const parts = highlightsContent.split(/\\item\b/).slice(1);
  return parts.map((p) => parseInline(p)).filter((runs) => runs.length > 0);
}

// Splits "\textbf{Company} ...rest..." into a flattened bold left string and
// the remaining content (parsed as rich runs, used as the subheader line).
function splitFirstBold(latex) {
  const m = latex.match(/\\textbf\{/);
  if (!m) return { leftText: flattenText(parseInline(latex)), restRuns: [] };
  const openIdx = m.index + m[0].length - 1;
  const closeIdx = findMatchingBrace(latex, openIdx);
  if (closeIdx === -1) return { leftText: flattenText(parseInline(latex)), restRuns: [] };
  const leftText = flattenText(parseInline(latex.slice(openIdx + 1, closeIdx)));
  let restRuns = parseInline(latex.slice(closeIdx + 1));
  // Drop a leading " | " artifact from a LaTeX \\ linebreak sitting right at the
  // split point (e.g. "\textbf{School} \\ \textit{Degree}") -- it's not a real
  // separator, just where the bold company/school name ended.
  if (restRuns.length && restRuns[0].text.trim() === '|') {
    restRuns = restRuns.slice(1);
    if (restRuns.length) restRuns[0] = { ...restRuns[0], text: restRuns[0].text.replace(/^\s+/, '') };
  }
  return { leftText, restRuns };
}

function parseSectionEntries(sectionBody) {
  const twocol = findEnvBlocks(sectionBody, 'twocolentry', true);
  const onecol = findEnvBlocks(sectionBody, 'onecolentry', false);
  const entries = [];

  function bulletsFromOnecolContent(content) {
    const hl = findEnvBlocks(content, 'highlights', false);
    if (hl.length > 0) return extractItems(hl[0].content);
    const hlAlt = findEnvBlocks(content, 'highlightsforbulletentries', false);
    if (hlAlt.length > 0) return extractItems(hlAlt[0].content);
    return null; // no bullet list found -- plain-text onecolentry
  }

  if (twocol.length > 0) {
    for (let i = 0; i < twocol.length; i++) {
      const tc = twocol[i];
      const nextStart = i + 1 < twocol.length ? twocol[i + 1].start : sectionBody.length;
      const oc = onecol.find((o) => o.start >= tc.end && o.start < nextStart);

      const { leftText, restRuns } = splitFirstBold(tc.content);
      const rightText = flattenText(parseInline(tc.arg || ''));
      const bullets = oc ? bulletsFromOnecolContent(oc.content) || [] : [];

      entries.push({
        type: 'entry',
        left: leftText,
        right: rightText,
        subheader: restRuns.length ? restRuns : null,
        bullets,
      });
    }
  } else if (onecol.length > 0) {
    for (const oc of onecol) {
      const bullets = bulletsFromOnecolContent(oc.content);
      if (bullets) entries.push({ type: 'bullets', bullets });
      else entries.push({ type: 'line', runs: parseInline(oc.content) });
    }
  } else {
    const items = extractItems(sectionBody);
    if (items.length) entries.push({ type: 'bullets', bullets: items });
  }

  return entries;
}

function extractSections(body) {
  const sections = [];
  const re = /\\section\{/g;
  const marks = [];
  let m;
  while ((m = re.exec(body))) {
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = findMatchingBrace(body, openIdx);
    if (closeIdx === -1) continue;
    marks.push({ titleStart: m.index, contentStart: openIdx + 1, contentEnd: closeIdx, bodyStart: closeIdx + 1 });
    re.lastIndex = closeIdx + 1;
  }
  for (let i = 0; i < marks.length; i++) {
    const title = flattenText(parseInline(body.slice(marks[i].contentStart, marks[i].contentEnd)));
    const bodyEnd = i + 1 < marks.length ? marks[i + 1].titleStart : body.length;
    const sectionBody = body.slice(marks[i].bodyStart, bodyEnd);
    sections.push({ title, entries: parseSectionEntries(sectionBody) });
  }
  return sections;
}

function extractName(body) {
  const hStart = body.indexOf('\\begin{header}');
  const hEnd = body.indexOf('\\end{header}');
  if (hStart === -1 || hEnd === -1) return '';
  const headerContent = body.slice(hStart, hEnd);
  const m = headerContent.match(/\\textbf\{/);
  if (!m) return '';
  const openIdx = hStart + m.index + m[0].length - 1;
  const closeIdx = findMatchingBrace(body, openIdx);
  if (closeIdx === -1) return '';
  return flattenText(parseInline(body.slice(openIdx + 1, closeIdx)));
}

// Returns { text, url } -- url is set when the segment was wrapped in
// \href/\hrefWithoutArrow, so the caller can render a real hyperlink.
function cleanContactSegment(inner) {
  let url = null;
  const hm = inner.match(/^\\(hrefWithoutArrow|href)/);
  if (hm) {
    const afterCmd = hm[0].length;
    const urlArg = extractArg(inner, afterCmd);
    if (urlArg) {
      url = urlArg.content.trim();
      const textArg = extractArg(inner, urlArg.end + 1);
      if (textArg) inner = textArg.content;
    }
  }
  let text = flattenText(parseInline(inner));
  if (url) {
    if (/linkedin\.com/i.test(url) && !/linkedin\.com/i.test(text)) {
      text = 'linkedin.com/in/' + text.replace(/^\/*(in\/)?/, '');
    } else if (/github\.com/i.test(url) && !/github\.com/i.test(text)) {
      text = 'github.com/' + text;
    }
  }
  return { text, url };
}

function extractContactSegments(centerBlockLatex) {
  const segments = [];
  const beginTag = '\\mbox{';
  let idx = 0;
  while (true) {
    const start = centerBlockLatex.indexOf(beginTag, idx);
    if (start === -1) break;
    const openIdx = start + beginTag.length - 1;
    const closeIdx = findMatchingBrace(centerBlockLatex, openIdx);
    if (closeIdx === -1) break;
    const seg = cleanContactSegment(centerBlockLatex.slice(openIdx + 1, closeIdx));
    if (seg.text) segments.push(seg);
    idx = closeIdx + 1;
  }
  return segments;
}

// Returns an array of { text, url|null } items, with plain "  |  " separators
// interleaved between segments. Consumed directly by docxBuilder so real
// links (mailto/https) can be rendered as clickable hyperlinks.
function extractContact(body) {
  const hEnd = body.indexOf('\\end{header}');
  const searchFrom = hEnd === -1 ? 0 : hEnd;
  const sectionIdx = body.indexOf('\\section{');
  const searchTo = sectionIdx === -1 ? body.length : sectionIdx;
  const region = body.slice(searchFrom, searchTo);
  const cStart = region.indexOf('\\begin{center}');
  const cEnd = region.indexOf('\\end{center}');
  if (cStart === -1 || cEnd === -1) return [];
  const centerContent = region.slice(cStart + '\\begin{center}'.length, cEnd);
  const segments = extractContactSegments(centerContent);
  const items = [];
  segments.forEach((seg, idx) => {
    if (idx > 0) items.push({ text: '  |  ', url: null });
    items.push({ text: seg.text, url: seg.url || null });
  });
  return items;
}

function parseLatexResume(rawLatex) {
  const stripped = stripComments(rawLatex);
  const body = extractBody(stripped);
  const name = extractName(body);
  const contact = extractContact(body);
  const sections = extractSections(body);

  if (sections.length === 0) {
    throw new Error(
      "Couldn't find the expected resume structure — this converter is tuned for the \\section / \\twocolentry / \\highlights template style.",
    );
  }

  return { name, contact, sections };
}

if (typeof window !== 'undefined') window.parseLatexResume = parseLatexResume;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseLatexResume,
    parseInline,
    flattenText,
    findMatchingBrace,
    extractArg,
    findEnvBlocks,
  };
}
