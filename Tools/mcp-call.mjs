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
  const list = tool === 'list';
  const res = await post({ jsonrpc: '2.0', id: 2, method: list ? 'tools/list' : 'tools/call', params: list ? {} : { name: tool, arguments: JSON.parse(args || '{}') } }, init.sid);
  console.log(list ? res.json.result.tools.map((t) => t.name).join(' ') : res.json?.result?.content?.map((c) => c.text).join('\n') ?? JSON.stringify(res.json));
} catch (e) {
  console.error(`MCP-CALL BLOCKED · ${URL} not reachable (${e.message}) — is the Unity editor open with the MCP server started?`);
  process.exit(2);
}
