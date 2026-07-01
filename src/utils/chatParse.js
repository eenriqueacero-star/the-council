/**
 * Parses AXIOM's raw chat output into renderable pieces: plain text, an optional
 * markdown table (rendered as ChatDataTable), an optional ACTION: tag (executed by
 * the chat), and optional QUICK_REPLIES chips.
 */

const ACTION_RE = /^ACTION:([A-Z_]+):?(.*)$/im;
const QUICK_REPLIES_RE = /QUICK_REPLIES:\s*(\[[\s\S]*?\])\s*$/im;

function parseMarkdownTable(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const headerLine = lines[i].trim();
    const sepLine = lines[i + 1].trim();
    if (!headerLine.startsWith('|') || !/^\|?[\s:|-]+\|?$/.test(sepLine) || !sepLine.includes('-')) continue;

    const headers = headerLine.split('|').map(s => s.trim()).filter(Boolean);
    if (headers.length < 2) continue;

    let end = i + 2;
    const rows = [];
    while (end < lines.length && lines[end].trim().startsWith('|')) {
      const cells = lines[end].trim().split('|').map(s => s.trim()).filter((_, idx, arr) => !(idx === 0 && arr[0] === '') );
      const cleaned = lines[end].trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());
      rows.push(cleaned);
      end++;
    }
    if (!rows.length) continue;

    const before = lines.slice(0, i).join('\n').trim();
    const after = lines.slice(end).join('\n').trim();
    return { headers, rows, before, after };
  }
  return null;
}

export function parseAssistantMessage(raw) {
  let text = (raw || '').trim();

  let quickReplies = [];
  const qrMatch = text.match(QUICK_REPLIES_RE);
  if (qrMatch) {
    try {
      const parsed = JSON.parse(qrMatch[1]);
      if (Array.isArray(parsed)) quickReplies = parsed.filter(s => typeof s === 'string').slice(0, 3);
    } catch {}
    text = text.slice(0, qrMatch.index).trim();
  }

  let action = null;
  const actionMatch = text.match(ACTION_RE);
  if (actionMatch) {
    action = { type: actionMatch[1], param: (actionMatch[2] || '').trim().replace(/^:/, '') };
    text = (text.slice(0, actionMatch.index) + text.slice(actionMatch.index + actionMatch[0].length)).trim();
  }

  let table = null;
  const tableResult = parseMarkdownTable(text);
  if (tableResult) {
    table = { headers: tableResult.headers, rows: tableResult.rows };
    text = [tableResult.before, tableResult.after].filter(Boolean).join('\n\n').trim();
  }

  return { text, table, action, quickReplies };
}
