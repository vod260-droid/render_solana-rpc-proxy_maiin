const http = require('http');
const { WebSocketServer, WebSocket } = require('ws'); // 明确导入 WebSocket 类
const fetch = require('node-fetch');

const TARGET_URL = process.env.TARGET_URL || 'https://api.mainnet-beta.solana.com'; // 默认 Solana 主网
const PORT = process.env.PORT || 8080;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const targetUrl = TARGET_URL + url.pathname + url.search;
  console.log(`[${new Date().toISOString()}] HTTP 请求: ${req.method} ${targetUrl}`);

  try {
    // 准备代理请求
    const proxyReq = {
      method: req.method,
      headers: { ...req.headers },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
    };
    delete proxyReq.headers.host;

    // 发送请求
    const proxyRes = await fetch(targetUrl, proxyReq);
    console.log(`[${new Date().toISOString()}] HTTP 响应: ${proxyRes.status}`);

    // 设置响应头
    res.statusCode = proxyRes.status;
    for (const [key, value] of proxyRes.headers.entries()) {
      res.setHeader(key, value);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', proxyRes.headers.get('content-type') || 'application/json');

    // 流式传输响应
    proxyRes.body.pipe(res);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 代理错误: ${error.message}`);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error.message }));
  }
});

// WebSocket 服务
const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const targetWsUrl = TARGET_URL.replace('https://', 'wss://') + url.pathname + url.search;
  console.log(`[${new Date().toISOString()}] WebSocket 连接: ${targetWsUrl}`);

  const wsTarget = new WebSocket(targetWsUrl); // 使用 ws 模块的 WebSocket 类

  wsTarget.on('open', () => {
    console.log(`[${new Date().toISOString()}] WebSocket 目标连接成功`);
    ws.on('message', (data) => wsTarget.send(data.toString())); // 确保数据为字符串
    wsTarget.on('message', (data) => ws.send(data));
  });

  wsTarget.on('close', () => {
    console.log(`[${new Date().toISOString()}] WebSocket 目标关闭`);
    ws.close();
  });

  wsTarget.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] WebSocket 目标错误: ${err.message}`);
    ws.close();
  });

  ws.on('close', () => {
    console.log(`[${new Date().toISOString()}] WebSocket 客户端关闭`);
    wsTarget.close();
  });

  ws.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] WebSocket 客户端错误: ${err.message}`);
    wsTarget.close();
  });
});

server.listen(PORT, () => {
  console.log(`代理服务器运行在端口 ${PORT}`);
});
