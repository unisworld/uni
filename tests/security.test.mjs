import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let serverModule;
let dataDir;

class MockResponse {
  statusCode = 200;
  headers = {};
  headersSent = false;
  body = "";
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  writeHead(status, headers = {}) {
    this.statusCode = status;
    Object.assign(this.headers, Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])));
    this.headersSent = true;
  }
  end(body = "") { this.body = String(body); this.writableEnded = true; }
  getHeader(name) { return this.headers[name.toLowerCase()]; }
}

async function request(method, url, body = null, headers = {}) {
  const bodyBuffer = body === null ? null : Buffer.from(body);
  const req = Readable.from(bodyBuffer ? [bodyBuffer] : []);
  req.method = method;
  req.url = url;
  req.headers = {
    host: "localhost",
    ...(bodyBuffer ? { "content-length": String(bodyBuffer.length) } : {}),
    ...headers,
  };
  req.socket = { remoteAddress: "127.0.0.1" };
  const res = new MockResponse();
  await serverModule.dispatchRequest(req, res);
  return {
    status: res.statusCode,
    headers: res.headers,
    json: () => JSON.parse(res.body),
    text: () => res.body,
  };
}

const jsonRequest = (method, url, value, extraHeaders = {}) => request(method, url, JSON.stringify(value), {
  "content-type": "application/json",
  ...extraHeaders,
});

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "uniworld-security-"));
  process.env.DATA_DIR = dataDir;
  process.env.DATABASE_URL = "";
  process.env.REVEAL_PASSPHRASE = "test-only-not-a-production-secret-32chars";
  serverModule = await import("../server.mjs");
  await serverModule.initialize();
});

after(async () => {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.REVEAL_PASSPHRASE;
});

test("state endpoint starts with no user data and no premature reveal", async () => {
  const response = await request("GET", "/api/state");
  assert.equal(response.status, 200);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  const state = response.json();
  assert.equal(state.occupied, 0);
  assert.equal(state.reveal, null);
  assert.deepEqual(state.parts, []);
});

test("issues an HttpOnly capability cookie; legacy fingerprint alone cannot access the new world", async () => {
  const created = await jsonRequest("POST", "/api/part", {
    ownerId: "test-owner-123", fingerprint: "test-profile-id-123456", clues: ["private-test-clue"],
  });
  assert.equal(created.status, 200);
  const result = created.json();
  assert.equal("accessToken" in result, false);
  const cookieHeader = created.headers["set-cookie"];
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /SameSite=Strict/);
  const cookie = cookieHeader.split(";", 1)[0];
  const accessToken = cookie.match(/^uniworld_access=([A-Za-z0-9_-]{43})$/)?.[1];
  assert.ok(accessToken);
  assert.equal("access_hash" in result.part, false);

  const anonymous = await request("GET", "/api/mine");
  assert.equal(anonymous.json(), null);
  const authorized = await request("GET", "/api/mine", null, { cookie });
  assert.equal(authorized.status, 200);
  assert.equal(authorized.json().part.cx, result.part.cx);
  const worldUrl = `/api/part/${result.part.cx}/${result.part.cy}`;
  const publicWorld = (await request("GET", worldUrl)).json();
  assert.equal(publicWorld.part.clues[0], null);
  assert.equal(JSON.stringify(publicWorld).includes("private-test-clue"), false);

  const point = publicWorld.local.cluePoints[0];
  // A visitor without a claimed world gets an independent, clue-only session.
  // The legacy owner query is ignored; progress is keyed only to the cookie.
  const visitorInit = await request("GET", "/api/clues?owner=test-owner-123");
  assert.equal(visitorInit.status, 200);
  assert.deepEqual(visitorInit.json().clues, []);
  const visitorSetCookie = visitorInit.headers["set-cookie"];
  assert.match(visitorSetCookie, /^uniworld_visitor=[A-Za-z0-9_-]{43};.*HttpOnly/);
  assert.match(visitorSetCookie, /SameSite=Strict/);
  const visitorCookie = visitorSetCookie.split(";", 1)[0];
  const visitorBefore = (await request("GET", worldUrl, null, { cookie: visitorCookie })).json();
  assert.equal(visitorBefore.part.clues[0], null);

  const visitorCollect = await jsonRequest("POST", "/api/clue", {
    ownerId: "test-owner-123", cx: result.part.cx, cy: result.part.cy, idx: 0, x: point.x, z: point.z,
  }, { cookie: visitorCookie });
  assert.equal(visitorCollect.status, 200);
  assert.equal(visitorCollect.json().clue, "private-test-clue");
  const visitorProgress = (await request("GET", "/api/clues?owner=attacker-controlled", null, { cookie: visitorCookie })).json();
  assert.deepEqual(visitorProgress.clues, [{ cx: result.part.cx, cy: result.part.cy, idx: 0 }]);
  const visitorRevealed = (await request("GET", worldUrl, null, { cookie: visitorCookie })).json();
  assert.equal(visitorRevealed.part.clues[0], "private-test-clue");

  // No world-management rights are granted by the visitor cookie.
  assert.equal((await request("GET", "/api/mine", null, { cookie: visitorCookie })).json(), null);
  const visitorEdit = await jsonRequest("POST", "/api/mine", { name: "Hijacked" }, { cookie: visitorCookie });
  assert.equal(visitorEdit.status, 404);
  const visitorSign = await jsonRequest("POST", "/api/sign", { text: "Hijacked" }, { cookie: visitorCookie });
  assert.equal(visitorSign.status, 404);

  // A separate visitor cannot see the first visitor's clue, despite a forged owner query.
  const secondVisitor = await request("GET", "/api/clues?owner=test-owner-123");
  assert.equal(secondVisitor.status, 200);
  assert.deepEqual(secondVisitor.json().clues, []);
  assert.notEqual(secondVisitor.headers["set-cookie"].split(";", 1)[0], visitorCookie);

  // The POST also bootstraps a fresh clue-only session when reached directly.
  const directVisitorCollect = await jsonRequest("POST", "/api/clue", {
    ownerId: "test-owner-123", cx: result.part.cx, cy: result.part.cy, idx: 1,
    x: publicWorld.local.cluePoints[1].x, z: publicWorld.local.cluePoints[1].z,
  });
  assert.equal(directVisitorCollect.status, 200);
  const directVisitorCookie = directVisitorCollect.headers["set-cookie"].split(";", 1)[0];
  assert.match(directVisitorCookie, /^uniworld_visitor=[A-Za-z0-9_-]{43}$/);
  const directProgress = (await request("GET", "/api/clues?owner=attacker-controlled", null, { cookie: directVisitorCookie })).json();
  assert.deepEqual(directProgress.clues, [{ cx: result.part.cx, cy: result.part.cy, idx: 1 }]);
  assert.equal((await request("GET", worldUrl, null, { cookie: directVisitorCookie })).json().part.clues[1], directVisitorCollect.json().clue);

  const collect = await jsonRequest("POST", "/api/clue", {
    ownerId: "attacker-controlled", cx: result.part.cx, cy: result.part.cy, idx: 0, x: point.x, z: point.z,
  }, { cookie });
  assert.equal(collect.status, 200);
  assert.equal(collect.json().clue, "private-test-clue");
  const revealedWorld = (await request("GET", worldUrl, null, { cookie })).json();
  assert.equal(revealedWorld.part.clues[0], "private-test-clue");
  const clues = (await request("GET", "/api/clues?owner=attacker-controlled", null, { cookie })).json();
  assert.deepEqual(clues.clues, [{ cx: result.part.cx, cy: result.part.cy, idx: 0 }]);

  const editDenied = await jsonRequest("POST", "/api/mine", {
    fingerprint: "test-profile-id-123456", name: "Hijack",
  });
  assert.equal(editDenied.status, 404);
  const editAllowed = await jsonRequest("POST", "/api/mine", { name: "Test World" }, { cookie });
  assert.equal(editAllowed.status, 200);

  const persisted = await readFile(join(dataDir, "parts.json"), "utf8");
  assert.equal(persisted.includes(accessToken), false);
});

test("rejects a JSON body over the bounded limit", async () => {
  const response = await jsonRequest("POST", "/api/part", { fingerprint: "x".repeat(20_000) });
  assert.equal(response.status, 413);
});

test("rejects malformed JSON with a client error rather than an internal error", async () => {
  const response = await request("POST", "/api/part", "{bad json", { "content-type": "application/json" });
  assert.equal(response.status, 400);
});

test("rejects body-bearing API requests without JSON content type", async () => {
  const response = await request("POST", "/api/part", "{}");
  assert.equal(response.status, 415);
});

test("does not serve server source or local database files", async () => {
  const source = await request("GET", "/server.mjs");
  assert.equal(source.status, 404);
  const data = await request("GET", "/data/parts.json");
  assert.equal(data.status, 404);
});
