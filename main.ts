// bark-mcp: Bark 推送的 MCP Server（Stateless Streamable HTTP）
const BARK_KEY = Deno.env.get("BARK_KEY") ?? "";
const DEFAULT_ICON = "https://s41.ax1x.com/2026/09/13/pnezSZ4.jpg";

const TOOLS = [
  {
    name: "bark_send",
    description: "通过 Bark 向手机推送一条通知。标题默认「老公」，图标默认使用预设头像。",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "通知标题，默认「老公」" },
        body: { type: "string", description: "通知正文内容" },
        group: { type: "string", description: "通知分组，可选" },
        icon: { type: "string", description: "图标 URL，可选，默认预设头像" },
        sound: { type: "string", description: "提示音名称，可选" },
      },
      required: ["body"],
    },
  },
];

async function sendBark(args) {
  if (!BARK_KEY) throw new Error("BARK_KEY 环境变量未配置");
  const title = args.title ?? "老公";
  const body = args.body ?? "";
  if (!body) throw new Error("body 不能为空");
  const params = new URLSearchParams({ icon: args.icon ?? DEFAULT_ICON });
  if (args.group) params.set("group", args.group);
  if (args.sound) params.set("sound", args.sound);
  const url = `https://api.day.app/${BARK_KEY}/${encodeURIComponent(title)}/${encodeURIComponent(body)}?${params.toString()}`;
  const res = await fetch(url);
  return await res.text();
}

function result(id, value) { return { jsonrpc: "2.0", id, result: value }; }
function err(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }

async function handle(msg) {
  const { method, id, params } = msg;
  if (method === "initialize") {
    return result(id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "bark-mcp", version: "1.0.0" },
    });
  }
  if (method === "ping") return result(id, {});
  if (method === "tools/list") return result(id, { tools: TOOLS });
  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments ?? {};
    if (name !== "bark_send") return err(id, -32601, `Unknown tool: ${name}`);
    try {
      const text = await sendBark(args);
      return result(id, { content: [{ type: "text", text }], isError: false });
    } catch (e) {
      return result(id, { content: [{ type: "text", text: String(e?.message ?? e) }], isError: true });
    }
  }
  return err(id, -32601, `Unknown method: ${method}`);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/") return Response.json({ name: "bark-mcp", endpoint: "/mcp", ok: true });
  if (url.pathname !== "/mcp") return new Response("Not found", { status: 404 });
  if (req.method === "POST") {
    let msg;
    try { msg = await req.json(); } catch { return Response.json(err(null, -32700, "Parse error"), { status: 400 }); }
    if (msg.method?.startsWith("notifications/")) return new Response(null, { status: 202 });
    return Response.json(await handle(msg));
  }
  return new Response("Method not allowed", { status: 405 });
});
