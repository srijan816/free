import { FastifyInstance } from 'fastify';

export function registerHomeRoutes(app: FastifyInstance) {
  const html = buildHomePage();

  app.get('/', async (_request, reply) => {
    reply.type('text/html; charset=utf-8').send(html);
  });

  app.get('/app', async (_request, reply) => {
    reply.type('text/html; charset=utf-8').send(html);
  });

  app.get('/favicon.ico', async (_request, reply) => {
    reply.code(204).send();
  });
}

function buildHomePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Free Atlas Control Room</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Space+Grotesk:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        color-scheme: light;
        --bg-1: #f6f2e7;
        --bg-2: #e3f3ed;
        --ink: #1a1c18;
        --muted: #5b5f59;
        --accent: #0f766e;
        --accent-2: #d97706;
        --card: rgba(255, 255, 255, 0.85);
        --border: rgba(26, 28, 24, 0.1);
        --shadow: 0 24px 60px rgba(18, 25, 20, 0.18);
        --radius: 18px;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Space Grotesk", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(1200px 600px at 10% -10%, rgba(15, 118, 110, 0.22), transparent 60%),
          radial-gradient(900px 500px at 90% 10%, rgba(217, 119, 6, 0.2), transparent 55%),
          linear-gradient(130deg, var(--bg-1), var(--bg-2));
        min-height: 100vh;
      }

      .frame {
        max-width: 1200px;
        margin: 0 auto;
        padding: 48px 24px 64px;
      }

      header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 32px;
      }

      .title-block {
        max-width: 620px;
      }

      h1 {
        font-family: "Fraunces", serif;
        font-size: clamp(2.4rem, 3vw, 3.6rem);
        margin: 0 0 10px;
        letter-spacing: -0.02em;
      }

      .subtitle {
        font-size: 1.05rem;
        color: var(--muted);
        margin: 0;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        border-radius: 999px;
        background: rgba(15, 118, 110, 0.12);
        color: var(--accent);
        font-weight: 600;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 22px;
      }

      .card {
        grid-column: span 6;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 22px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(12px);
        animation: rise 0.6s ease both;
      }

      .card.full {
        grid-column: span 12;
      }

      .card h2 {
        margin: 0 0 14px;
        font-size: 1.2rem;
      }

      .status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 14px;
      }

      .status-pill {
        padding: 14px 16px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.7);
      }

      .status-pill strong {
        display: block;
        font-size: 0.95rem;
      }

      .status-pill span {
        font-size: 0.85rem;
        color: var(--muted);
      }

      .status-pill[data-state="healthy"] {
        border-color: rgba(15, 118, 110, 0.4);
      }

      .status-pill[data-state="degraded"] {
        border-color: rgba(217, 119, 6, 0.4);
      }

      .status-pill[data-state="unhealthy"] {
        border-color: rgba(190, 18, 60, 0.4);
      }

      .form-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
      }

      label {
        font-size: 0.85rem;
        color: var(--muted);
      }

      input,
      select,
      textarea {
        width: 100%;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--border);
        font-family: inherit;
        font-size: 0.95rem;
        background: rgba(255, 255, 255, 0.9);
      }

      textarea {
        min-height: 120px;
        resize: vertical;
      }

      button {
        padding: 10px 16px;
        border-radius: 999px;
        border: none;
        background: var(--accent);
        color: white;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      button.secondary {
        background: rgba(15, 118, 110, 0.12);
        color: var(--accent);
      }

      button:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 24px rgba(15, 118, 110, 0.2);
      }

      .quick-actions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }

      .quick-actions button {
        justify-content: center;
      }

      .console-output {
        background: #0f172a;
        color: #e2e8f0;
        border-radius: 14px;
        padding: 16px;
        font-family: "SFMono-Regular", "Consolas", monospace;
        font-size: 0.85rem;
        white-space: pre-wrap;
        min-height: 120px;
      }

      .muted {
        color: var(--muted);
      }

      .footer {
        margin-top: 24px;
        font-size: 0.9rem;
        color: var(--muted);
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: space-between;
      }

      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(16px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 900px) {
        .card {
          grid-column: span 12;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .card {
          animation: none;
        }
        button {
          transition: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="frame">
      <header>
        <div class="title-block">
          <div class="badge">Event-Driven Atlas Suite</div>
          <h1>Free Atlas Control Room</h1>
          <p class="subtitle">
            One interface for orchestration, money flow, and intelligence. API traffic is routed through the Part 4
            gateway.
          </p>
        </div>
        <div class="status-pill" data-state="healthy">
          <strong>Gateway</strong>
          <span id="gateway-origin">checking...</span>
        </div>
      </header>

      <section class="grid">
        <div class="card">
          <h2>Service Pulse</h2>
          <div class="status-grid" id="service-status">
            <div class="status-pill"><strong>Loading</strong><span>checking</span></div>
          </div>
          <div class="form-row" style="margin-top: 16px;">
            <button id="refresh-status" class="secondary">Refresh status</button>
            <span class="muted" id="status-updated">never</span>
          </div>
        </div>

        <div class="card">
          <h2>Auth Session</h2>
          <div class="form-row">
            <label for="token">Access token (Bearer)</label>
            <input id="token" type="password" placeholder="paste access token" autocomplete="off" />
          </div>
          <div class="form-row" style="margin-top: 14px;">
            <button id="save-token" class="secondary">Save token</button>
            <button id="clear-token" class="secondary">Clear token</button>
          </div>
          <hr style="border: none; border-top: 1px solid var(--border); margin: 16px 0;" />
          <div class="form-row" style="align-items: flex-start;">
            <div style="flex: 1;">
              <label for="login-email">Login</label>
              <input id="login-email" type="email" placeholder="email@company.com" />
            </div>
            <div style="flex: 1;">
              <label for="login-password">Password</label>
              <input id="login-password" type="password" placeholder="password" />
            </div>
          </div>
          <div class="form-row" style="margin-top: 10px;">
            <button id="login-btn">Login and set token</button>
          </div>
          <p class="muted" id="auth-message"></p>
        </div>

        <div class="card full">
          <h2>API Console</h2>
          <div class="form-row">
            <div style="flex: 0 0 140px;">
              <label for="method">Method</label>
              <select id="method">
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>DELETE</option>
              </select>
            </div>
            <div style="flex: 1;">
              <label for="path">Path (gateway)</label>
              <input id="path" value="/api/v1/dashboard" />
            </div>
          </div>
          <div class="form-row" style="margin-top: 12px;">
            <div style="flex: 1;">
              <label for="body">JSON body (optional)</label>
              <textarea id="body" placeholder='{"example": true}'></textarea>
            </div>
            <div style="flex: 0 0 220px;">
              <label>Quick actions</label>
              <div class="quick-actions">
                <button class="secondary" data-path="/api/v1/health">Gateway health</button>
                <button class="secondary" data-path="/api/v1/dashboard">Liquid balance</button>
                <button class="secondary" data-path="/api/v1/invoices">List invoices</button>
                <button class="secondary" data-path="/api/v1/expenses">List expenses</button>
              </div>
            </div>
          </div>
          <div class="form-row" style="margin-top: 12px;">
            <button id="send-request">Send request</button>
            <span class="muted" id="request-status">idle</span>
          </div>
          <div class="console-output" id="response-output">Waiting for request...</div>
        </div>
      </section>

      <div class="footer">
        <span>Gateway base: <strong id="gateway-base"></strong></span>
        <span>Ports: 22001 / 22002 / 22003 / 22004</span>
      </div>
    </div>

    <script>
      const state = {
        token: localStorage.getItem("accessToken") || ""
      };

      const tokenInput = document.getElementById("token");
      const authMessage = document.getElementById("auth-message");
      const gatewayBase = document.getElementById("gateway-base");
      const gatewayOrigin = document.getElementById("gateway-origin");
      const statusContainer = document.getElementById("service-status");
      const statusUpdated = document.getElementById("status-updated");
      const responseOutput = document.getElementById("response-output");
      const requestStatus = document.getElementById("request-status");

      tokenInput.value = state.token;
      gatewayBase.textContent = window.location.origin;
      gatewayOrigin.textContent = window.location.origin;

      function setStatus(text, type) {
        requestStatus.textContent = text;
        requestStatus.style.color = type === "error" ? "#b91c1c" : "#0f766e";
      }

      function formatJson(data) {
        try {
          return JSON.stringify(data, null, 2);
        } catch {
          return String(data);
        }
      }

      async function apiRequest(path, options = {}) {
        const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
        if (state.token) {
          headers.Authorization = "Bearer " + state.token;
        }

        const response = await fetch(path, {
          method: options.method || "GET",
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined
        });

        const text = await response.text();
        let data = text;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text;
        }

        return { ok: response.ok, status: response.status, data };
      }

      async function refreshStatus() {
        const statusHtml = [];
        const now = new Date();
        statusUpdated.textContent = "updated " + now.toLocaleTimeString();

        const gateway = await apiRequest("/health");
        statusHtml.push(renderStatus("Gateway", gateway.data?.status || (gateway.ok ? "healthy" : "unhealthy")));

        const services = await apiRequest("/health/services");
        if (services.ok && services.data) {
          for (const [name, payload] of Object.entries(services.data)) {
            statusHtml.push(renderStatus(name, payload.status || "unknown"));
          }
        } else {
          statusHtml.push(renderStatus("Services", "unknown"));
        }

        statusContainer.innerHTML = statusHtml.join("");
      }

      function renderStatus(name, status) {
        const state = status || "unknown";
        const label = state === "healthy" ? "healthy" : state === "degraded" ? "degraded" : "unhealthy";
        return \`<div class="status-pill" data-state="\${label}">
          <strong>\${name}</strong>
          <span>\${label}</span>
        </div>\`;
      }

      document.getElementById("save-token").addEventListener("click", () => {
        state.token = tokenInput.value.trim();
        localStorage.setItem("accessToken", state.token);
        authMessage.textContent = state.token ? "Token stored locally." : "Token cleared.";
      });

      document.getElementById("clear-token").addEventListener("click", () => {
        state.token = "";
        tokenInput.value = "";
        localStorage.removeItem("accessToken");
        authMessage.textContent = "Token cleared.";
      });

      document.getElementById("login-btn").addEventListener("click", async () => {
        const email = document.getElementById("login-email").value.trim();
        const password = document.getElementById("login-password").value.trim();
        authMessage.textContent = "Signing in...";
        try {
          const result = await apiRequest("/api/v1/auth/login", {
            method: "POST",
            body: { email, password }
          });
          if (!result.ok) {
            authMessage.textContent = "Login failed: " + (result.data?.error?.message || result.status);
            return;
          }
          const token = result.data?.data?.access_token;
          if (token) {
            state.token = token;
            tokenInput.value = token;
            localStorage.setItem("accessToken", token);
            authMessage.textContent = "Token stored. Ready to run requests.";
          } else {
            authMessage.textContent = "Login succeeded, but no access token returned.";
          }
        } catch (error) {
          authMessage.textContent = "Login error. Check network.";
        }
      });

      document.getElementById("send-request").addEventListener("click", async () => {
        const method = document.getElementById("method").value;
        const path = document.getElementById("path").value.trim();
        const bodyText = document.getElementById("body").value.trim();
        let body = undefined;
        if (bodyText) {
          try {
            body = JSON.parse(bodyText);
          } catch {
            setStatus("Invalid JSON body", "error");
            return;
          }
        }
        setStatus("sending...", "ok");
        try {
          const result = await apiRequest(path, { method, body });
          responseOutput.textContent = formatJson(result);
          setStatus("done (" + result.status + ")", result.ok ? "ok" : "error");
        } catch (error) {
          responseOutput.textContent = "Request failed.";
          setStatus("request failed", "error");
        }
      });

      document.querySelectorAll("[data-path]").forEach((button) => {
        button.addEventListener("click", () => {
          document.getElementById("path").value = button.dataset.path;
          document.getElementById("method").value = "GET";
        });
      });

      document.getElementById("refresh-status").addEventListener("click", refreshStatus);
      refreshStatus();
    </script>
  </body>
</html>`;
}
