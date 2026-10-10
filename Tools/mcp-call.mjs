#!/usr/bin/env node
// Call a Unity-MCP tool over HTTP when the MCP tools are missing in this Claude session
// (the editor/MCP server started after the session). Usage:
//   node Tools/mcp-call.mjs list
//   node Tools/mcp-call.mjs refresh_unity '{"compile":"request","wait_for_ready":true}'
//   node Tools/mcp-call.mjs run_tests '{"mode":"EditMode"}'
const URL = process.env.UNITY_MCP_URL ?? 'http://127.0.0.1:8080/mcp';
const H = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

async function post(body, sid) {
  const r = await fetch(URL, { method: 'POST', headers: sid ? { ...H, 'mcp-session-id': sid } : H, body: JSON.stringify(body) });
  const text = await r.text();
  const m = text.match(/^data: (.*)$/m);
  return { sid: r.headers.get('mcp-session-id'), json: m ? JSON.parse(m[1]) : text ? JSON.parse(text) : null };
}

const [tool, args] = process.argv.slice(2);
if (!tool) {
  console.error('usage: node Tools/mcp-call.mjs <tool|list> [json-args]');
  process.exit(2);
}
try {
  const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'mcp-call', version: '1' } } });
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, init.sid);
  // Never compile under a running game (twice a recompile broke the human's play session, once by a
  // direct call that bypassed lib/fresh.mjs). The guard lives here, so no caller can skip it.
  if (tool === 'refresh_unity' && process.env.MCP_ALLOW_PLAY_REFRESH !== '1') {
    const st = await post({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'execute_code', arguments: { action: 'execute', code: 'return EditorApplication.isPlayingOrWillChangePlaymode ? "play" : "edit";' } } }, init.sid);
    const text = st.json?.result?.content?.map((c) => c.text).join('') ?? '';
    if (text.includes('"play"')) {
      console.error('MCP-CALL BLOCKED · refresh_unity while the editor is playing (the human may be playing) — ask first');
      process.exit(2);
    }
  }
  const list = tool === 'list';
  // Right after a build or a domain reload the editor is briefly not attached ("no_unity_session"): wait and
  // retry up to 60 s instead of failing the caller (bench and views failed on it in Phase 9).
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await post({ jsonrpc: '2.0', id: 2, method: list ? 'tools/list' : 'tools/call', params: list ? {} : { name: tool, arguments: JSON.parse(args || '{}') } }, init.sid);
    const text = res.json?.result?.content?.map((c) => c.text).join('') ?? '';
    if (!text.includes('no_unity_session') || attempt >= 60) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(list ? res.json.result.tools.map((t) => t.name).join(' ') : res.json?.result?.content?.map((c) => c.text).join('\n') ?? JSON.stringify(res.json));
} catch (e) {
  console.error(`MCP-CALL BLOCKED · ${URL} not reachable (${e.message}) — is the Unity editor open with the MCP server started?`);
  process.exit(2);
}
