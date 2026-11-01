// The MCP server of the public API (POST /api/v1/mcp): an AI assistant (Claude, ChatGPT, Cursor...) speaks
// JSON-RPC to it over the Streamable HTTP transport and gets one tool per address of endpoints.js that its key
// opens. Hand-written on purpose (no SDK): the server only lists and calls read-only tools, without sessions
// or server-sent events, which is a few messages of the protocol.
//
// A tool call is NOT answered here: it is sent back to the gateway as a plain GET /api/v1/... with the same key
// (see `createMcpRoute`), so it passes the very same checks as a program calling the address itself: the key,
// its scope, its rate limit (each call counts), GET only, the allow-list of addresses.
import { API_ENDPOINTS, CATALOG_FAMILIES } from "./endpoints.js";
import { keyFromRequest } from "./api-key-domain.js";

/** The versions of the protocol we speak, the newest first (the answer to a client that asks for another one). */
export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const SERVER_INFO = { name: "hok-scrim-lab", title: "HOK API (Honor of Kings)", version: "1.0.0" };
const INSTRUCTIONS =
  "Read-only data of Honor of Kings Global (heroes, items, arcana, spells, tier list, tournaments) and the " +
  "user's own data on HOK Global Scrim Lab (scrims, tier lists, teams, training). Hero ids look like h105; " +
  "call list_heroes first to find one.";

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const failure = (id, code, message) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message }
});
const success = (id, result) => ({ jsonrpc: "2.0", id, result });

/** The input of a tool: each `:part` of its address (required), then the query parameters it reads. */
function inputSchemaOf(endpoint) {
  const properties = {};
  const required = [];
  for (const [, name] of endpoint.path.matchAll(/:(\w+)/g)) {
    properties[name] =
      name === "family"
        ? { type: "string", enum: CATALOG_FAMILIES, description: "The family of the catalogue." }
        : { type: "string", description: `The ${name} of the thing.` };
    required.push(name);
  }
  for (const parameter of endpoint.query ?? []) {
    properties[parameter.name] = { type: "string", description: parameter.description };
  }
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

const toolOf = endpoint => ({
  name: endpoint.tool,
  title: endpoint.summary.split(":")[0].replace(/\.$/, ""),
  description: `${endpoint.summary} (GET /api/v1${endpoint.path}, scope ${endpoint.scope})`,
  inputSchema: inputSchemaOf(endpoint),
  annotations: { readOnlyHint: true, openWorldHint: false }
});

/** The tools a key with these scopes sees: one per address it may read, then the extra ones it may use. */
export function toolsFor(scopes, extraTools = []) {
  return [
    ...API_ENDPOINTS.filter(endpoint => scopes.includes(endpoint.scope)).map(toolOf),
    ...extraTools
      .filter(tool => scopes.includes(tool.scope))
      .map(({ name, title, description, inputSchema, annotations }) => ({
        name,
        ...(title ? { title } : {}),
        description,
        inputSchema,
        ...(annotations ? { annotations } : {})
      }))
  ];
}

class ArgumentError extends Error {}

const plain = (value, name) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.length <= 200) {
    return value;
  }
  throw new ArgumentError(`The argument ${name} must be a short text.`);
};

/** The address (after /api/v1) a call of the tool of `endpoint` reads, or an ArgumentError. */
export function pathOf(endpoint, args = {}) {
  const path = endpoint.path.replace(/:(\w+)/g, (_match, name) => {
    if (args[name] === undefined) {
      throw new ArgumentError(`The argument ${name} is required.`);
    }
    const value = plain(args[name], name);
    if (!value || value === "." || value === ".." || /[/\\]/.test(value)) {
      throw new ArgumentError(`The argument ${name} is not valid.`);
    }
    return encodeURIComponent(value);
  });
  if (!endpoint.pattern.test(path)) {
    throw new ArgumentError("An argument is not valid for this tool.");
  }
  const query = new URLSearchParams();
  for (const { name } of endpoint.query ?? []) {
    if (args[name] !== undefined && args[name] !== null && args[name] !== "") {
      query.append(name, plain(args[name], name));
    }
  }
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

/** What a tool call answers: the JSON as text (every client reads it) and as structured content. */
function resultOf(status, body) {
  if (status >= 200 && status < 300) {
    return {
      content: [{ type: "text", text: JSON.stringify(body) }],
      ...(body && typeof body === "object" && !Array.isArray(body)
        ? { structuredContent: body }
        : {}),
      isError: false
    };
  }
  const why = body?.error ?? "The API refused the call.";
  return {
    content: [{ type: "text", text: `${status} ${body?.code ?? "error"}: ${why}` }],
    isError: true
  };
}

/**
 * The JSON-RPC side, without HTTP: `read(path)` gets an address of the API as the key ({ status, body });
 * `extraTools` are tools that are not a GET of endpoints.js, each { name, scope, description, inputSchema,
 * call(args, context) } (see README.md). Answers a message with the response
 * to send, or null when there is none to send (a notification, or a response of the client).
 */
export function createMcpDispatcher({ read, extraTools = [] }) {
  async function callTool(id, params, context) {
    if (!params || typeof params.name !== "string") {
      return failure(id, INVALID_PARAMS, "tools/call needs the name of a tool.");
    }
    const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
    const endpoint = API_ENDPOINTS.find(
      entry => entry.tool === params.name && context.scopes.includes(entry.scope)
    );
    const extra = extraTools.find(
      tool => tool.name === params.name && context.scopes.includes(tool.scope)
    );
    if (!endpoint && !extra) {
      return failure(id, INVALID_PARAMS, `Unknown tool: ${params.name}.`);
    }
    try {
      if (extra) {
        return success(id, resultOf(200, await extra.call(args, context)));
      }
      const { status, body } = await read(pathOf(endpoint, args), context);
      return success(id, resultOf(status, body));
    } catch (error) {
      if (error instanceof ArgumentError) {
        return failure(id, INVALID_PARAMS, error.message);
      }
      // a refusal of an extra tool (400, 429...) is a tool result, as a refusal of an address is
      if (extra && Number.isInteger(error.status) && error.status < 500) {
        return success(id, resultOf(error.status, { error: error.message, code: error.code }));
      }
      throw error;
    }
  }

  return async function dispatch(message, context) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return failure(null, INVALID_REQUEST, "Send one JSON-RPC 2.0 message.");
    }
    if (message.jsonrpc !== "2.0") {
      return failure(message.id, INVALID_REQUEST, "Send one JSON-RPC 2.0 message.");
    }
    if (typeof message.method !== "string") {
      return null; // a response of the client (we never ask it anything): nothing to answer
    }
    if (message.id === undefined) {
      return null; // a notification (initialized, cancelled): nothing to answer
    }
    const { id, method, params } = message;
    switch (method) {
      case "initialize": {
        const asked = params?.protocolVersion;
        return success(id, {
          protocolVersion: MCP_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS
        });
      }
      case "ping":
        return success(id, {});
      case "tools/list":
        return success(id, { tools: toolsFor(context.scopes, extraTools) });
      case "tools/call":
        return callTool(id, params, context);
      default:
        return failure(id, METHOD_NOT_FOUND, `Unknown method: ${method}.`);
    }
  };
}

const parsed = text => {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
};

/** The address of this server as the request reached it, to send a tool call back through the gateway. */
function selfOrigin(request) {
  const address = String(request.socket.localAddress ?? "127.0.0.1").replace(/^::ffff:/, "");
  const host = address.includes(":") ? `[${address}]` : address;
  return `http://${host}:${request.socket.localPort}`;
}

/**
 * The Express handler of POST /api/v1/mcp, mounted by the gateway after the key, its rate limit and the record of
 * its use. A tool call is read again through the gateway, as a GET with the same key.
 */
export function createMcpRoute({ extraTools = [], fetchImpl = fetch } = {}) {
  const read = async (path, { request }) => {
    const answer = await fetchImpl(`${selfOrigin(request)}/api/v1${path}`, {
      headers: {
        authorization: `Bearer ${keyFromRequest(request)}`,
        "accept-language": request.get("accept-language") ?? "en"
      }
    });
    const text = await answer.text();
    return { status: answer.status, body: parsed(text) };
  };
  const dispatch = createMcpDispatcher({ read, extraTools });
  return async (request, response, next) => {
    try {
      const answer = await dispatch(request.body, {
        scopes: request.apiKey.scopes,
        request,
        response
      });
      if (!answer) {
        return response.status(202).end();
      }
      response.json(answer);
    } catch (error) {
      next(error);
    }
  };
}
