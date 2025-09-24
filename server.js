const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const fetch = require('node-fetch');

const TARGET_URL = process.env.TARGET_URL || 'https://api.mainnet-beta.solana.com';
const PORT = process.env.PORT || 8080;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const targetUrl = TARGET_URL + url.pathname + url.search;
  console.log(`[${new Date().toISOString()}] HTTP 请求: ${req.method} ${targetUrl}`);

  try {
    const proxyReq = {
      method: req.method,
      headers: { ...req.headers },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
    };
    delete proxyReq.headers.host;

    const proxyRes = await fetch(targetUrl, proxyReq);
    console.log(`[${new Date().toISOString()}] HTTP 响应: ${proxyRes.status}`);

    res.statusCode = proxyRes.status;
    for (const [key, value] of proxyRes.headers.entries()) {
      res.setHeader(key, value);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', proxyRes.headers.get('content-type') || 'application/json');

    proxyRes.body.pipe(res);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] HTTP 代理错误: ${error.message}`);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error.message }));
  }
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const targetWsUrl = TARGET_URL.replace('https://', 'wss://') + url.pathname + url.search;
  console.log(`[${new Date().toISOString()}] WebSocket 连接: ${targetWsUrl}`);

  const wsTarget = new WebSocket(targetWsUrl);

  wsTarget.on('open', () => {
    console.log(`[${new Date().toISOString()}] WebSocket 目标连接成功`);
    ws.on('message', (data) => {
      console.log(`[${new Date().toISOString()}] 客户端消息: ${data}`);
      wsTarget.send(data.toString());
    });
    wsTarget.on('message', (data) => {
      console.log(`[${new Date().toISOString()}] 目标消息: ${data}`);
      ws.send(data);
    });
  });

  wsTarget.on('close', (code, reason) => {
    console.log(`[${new Date().toISOString()}] WebSocket 目标关闭: code=${code}, reason=${reason}`);
    ws.close();
  });

  wsTarget.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] WebSocket 目标错误: ${err.message}`);
    ws.close();
  });

  ws.on('message', (data) => {
    console.log(`[${new Date().toISOString()}] 客户端发送: ${data}`);
    if (wsTarget.readyState === WebSocket.OPEN) {
      wsTarget.send(data.toString());
    } else {
      console.log(`[${new Date().toISOString()}] 目标 WebSocket 未打开，状态: ${wsTarget.readyState}`);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[${new Date().toISOString()}] WebSocket 客户端关闭: code=${code}, reason=${reason}`);
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
