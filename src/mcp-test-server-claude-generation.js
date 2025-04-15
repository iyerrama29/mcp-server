// MCP Test Server
// A simple implementation of a Management Control Protocol test server

const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

// Configuration
const HTTP_PORT = 8080;
const WS_PORT = 8081;

// In-memory session tracking
const activeSessions = new Map();

// HTTP Server for initial connection and authentication
const httpServer = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/mcp/auth') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        // Simple authentication (for test server only)
        if (data.username && data.password) {
          // Generate session token
          const sessionToken = crypto.randomBytes(16).toString('hex');
          
          // Store session data
          activeSessions.set(sessionToken, {
            username: data.username,
            authenticated: true,
            createdAt: new Date(),
            permissions: ['read', 'write', 'admin'] // Default test permissions
          });
          
          // Send token to client
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            sessionToken,
            wsEndpoint: `ws://localhost:${WS_PORT}/mcp`
          }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Invalid credentials' }));
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid request format' }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Endpoint not found' }));
  }
});

// WebSocket Server for MCP communication
const wsServer = new WebSocket.Server({ port: WS_PORT });

wsServer.on('connection', (ws, req) => {
  let sessionToken = null;
  let sessionData = null;
  
  console.log('New WebSocket connection established');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Initial authentication with session token
      if (data.type === 'auth' && data.sessionToken) {
        sessionToken = data.sessionToken;
        sessionData = activeSessions.get(sessionToken);
        
        if (sessionData) {
          ws.send(JSON.stringify({
            type: 'auth_response',
            success: true,
            username: sessionData.username,
            permissions: sessionData.permissions
          }));
          console.log(`User ${sessionData.username} authenticated via WebSocket`);
        } else {
          ws.send(JSON.stringify({
            type: 'auth_response',
            success: false,
            message: 'Invalid session token'
          }));
        }
      }
      // Handle MCP commands
      else if (sessionData && data.type === 'command') {
        handleMCPCommand(ws, data, sessionData);
      }
      // Ping/keepalive
      else if (data.type === 'ping') {
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString()
        }));
      }
      else {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Unknown message type or not authenticated'
        }));
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    // Optional: clean up session if needed
  });
});

// MCP Command handler
function handleMCPCommand(ws, command, sessionData) {
  console.log(`Received command: ${command.action} from ${sessionData.username}`);
  
  switch (command.action) {
    case 'get_status':
      ws.send(JSON.stringify({
        type: 'command_response',
        action: 'get_status',
        requestId: command.requestId,
        data: {
          status: 'online',
          uptime: process.uptime(),
          activeSessions: activeSessions.size,
          serverTime: new Date().toISOString()
        }
      }));
      break;
      
    case 'list_resources':
      ws.send(JSON.stringify({
        type: 'command_response',
        action: 'list_resources',
        requestId: command.requestId,
        data: {
          resources: [
            { id: 'res1', name: 'Resource 1', type: 'device', status: 'active' },
            { id: 'res2', name: 'Resource 2', type: 'service', status: 'inactive' },
            { id: 'res3', name: 'Resource 3', type: 'device', status: 'maintenance' }
          ]
        }
      }));
      break;
      
    case 'update_resource':
      if (command.resourceId && command.data) {
        ws.send(JSON.stringify({
          type: 'command_response',
          action: 'update_resource',
          requestId: command.requestId,
          success: true,
          data: {
            resourceId: command.resourceId,
            message: 'Resource updated successfully'
          }
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'command_response',
          action: 'update_resource',
          requestId: command.requestId,
          success: false,
          error: 'Missing resource ID or update data'
        }));
      }
      break;
      
    default:
      ws.send(JSON.stringify({
        type: 'command_response',
        action: command.action,
        requestId: command.requestId,
        success: false,
        error: 'Unknown command'
      }));
  }
}

// Start the servers
httpServer.listen(HTTP_PORT, () => {
  console.log(`MCP HTTP Server running on port ${HTTP_PORT}`);
});

console.log(`MCP WebSocket Server running on port ${WS_PORT}`);
console.log('Test server ready! Use the following flow to test:');
console.log(`1. POST to http://localhost:${HTTP_PORT}/mcp/auth with {"username":"test","password":"test"}`);
console.log(`2. Connect WebSocket to ws://localhost:${WS_PORT}/mcp`);
console.log('3. Send auth message: {"type":"auth","sessionToken":"TOKEN_FROM_STEP_1"}');
console.log('4. Send commands: {"type":"command","action":"get_status","requestId":"123"}');