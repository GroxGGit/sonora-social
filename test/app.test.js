import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { io as createSocketClient } from "socket.io-client";
import { createApplication } from "../server/index.js";

let app;
let baseUrl;
let directory;
let aliceCookie;
let bobCookie;
let alice;
let bob;

async function request(cookie, route, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // Non-JSON responses are asserted by the caller when expected.
  }
  return { response, payload };
}

async function register(username, displayName, interests) {
  const result = await request(null, "/api/auth/register", {
    method: "POST",
    body: { username, displayName, password: "a-secure-test-password", interests }
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  const cookieHeader = result.response.headers.get("set-cookie");
  assert.match(cookieHeader, /HttpOnly/i);
  assert.match(cookieHeader, /SameSite=Strict/i);
  return { user: result.payload.user, cookie: cookieHeader.split(";")[0] };
}

async function connectSocket(cookie) {
  const socket = createSocketClient(baseUrl, {
    transports: ["websocket"],
    reconnection: false,
    timeout: 5000,
    extraHeaders: { Cookie: cookie, Origin: baseUrl }
  });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "sonora-test-"));
  app = createApplication({ databasePath: join(directory, "test.sqlite") });
  await new Promise((resolve, reject) => {
    app.httpServer.once("error", reject);
    app.httpServer.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${app.httpServer.address().port}`;
});

after(async () => {
  if (app) app.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("MVP integrates accounts, music recommendations, social actions, privacy, collections, and live chat", async () => {
  const health = await request(null, "/api/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.payload.status, "ok");

  const anonymous = await request(null, "/api/me");
  assert.equal(anonymous.response.status, 401);
  const anonymousSession = await request(null, "/api/auth/session");
  assert.equal(anonymousSession.response.status, 200);
  assert.equal(anonymousSession.payload.user, null);
  const crossOrigin = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
    body: JSON.stringify({ username: "bad_user", displayName: "Bad User", password: "a-secure-test-password" })
  });
  assert.equal(crossOrigin.status, 403);

  const registeredAlice = await register("alice_music", "Alicia Música", ["Indie", "Pop"]);
  alice = registeredAlice.user;
  aliceCookie = registeredAlice.cookie;
  const registeredBob = await register("bob_sounds", "Bruno Sonoro", ["Rock", "Indie"]);
  bob = registeredBob.user;
  bobCookie = registeredBob.cookie;

  const duplicate = await request(null, "/api/auth/register", {
    method: "POST",
    body: { username: "alice_music", displayName: "Otra Alicia", password: "a-secure-test-password", interests: [] }
  });
  assert.equal(duplicate.response.status, 409);

  const badLogin = await request(null, "/api/auth/login", {
    method: "POST",
    body: { username: "alice_music", password: "incorrecta" }
  });
  assert.equal(badLogin.response.status, 401);

  const initialFeed = await request(aliceCookie, "/api/feed");
  assert.equal(initialFeed.response.status, 200);
  assert.equal(initialFeed.payload.recommendations.length, 12);
  assert.ok(initialFeed.payload.recommendations.every((track) => track.reason.length > 0));

  const initialSong = await request(aliceCookie, "/api/recommendations/cafe-de-medianoche/feedback", {
    method: "PUT",
    body: { action: "like" }
  });
  assert.equal(initialSong.response.status, 200);
  const tailoredRecommendations = await request(aliceCookie, "/api/recommendations");
  assert.ok(tailoredRecommendations.payload.recommendations.some((track) => track.reason.includes("interacciones con Jazz")));

  const privateProfile = await request(bobCookie, "/api/me", { method: "PATCH", body: { isPrivate: true, bio: "Jazz y caminatas" } });
  assert.equal(privateProfile.response.status, 200);
  const privateSearch = await request(aliceCookie, "/api/users?q=bob");
  assert.equal(privateSearch.payload.users[0].bio, "");
  assert.deepEqual(privateSearch.payload.users[0].interests, []);

  const followRequest = await request(aliceCookie, `/api/users/${bob.id}/follow`, { method: "POST", body: {} });
  assert.equal(followRequest.response.status, 202);
  const pendingProfile = await request(aliceCookie, `/api/users/${bob.id}`);
  assert.equal(pendingProfile.payload.requestPending, true);
  assert.equal(pendingProfile.payload.posts.length, 0);

  const pendingRequests = await request(bobCookie, "/api/follow-requests");
  assert.equal(pendingRequests.payload.requests.length, 1);
  const accepted = await request(bobCookie, `/api/follow-requests/${alice.id}`, { method: "POST", body: { action: "accept" } });
  assert.equal(accepted.payload.accepted, true);
  const followedProfile = await request(aliceCookie, `/api/users/${bob.id}`);
  assert.equal(followedProfile.payload.user.bio, "Jazz y caminatas");
  assert.deepEqual(followedProfile.payload.user.interests, ["Rock", "Indie"]);

  const post = await request(bobCookie, "/api/posts", {
    method: "POST",
    body: { body: "Esta canción <script>no debe ejecutarse</script> me acompaña.", trackId: "rio-de-limon" }
  });
  assert.equal(post.response.status, 201);
  assert.equal(post.payload.post.track.id, "rio-de-limon");
  const socialFeed = await request(aliceCookie, "/api/feed");
  assert.equal(socialFeed.payload.posts.length, 1);
  assert.equal(socialFeed.payload.posts[0].author.id, bob.id);

  const reaction = await request(aliceCookie, `/api/posts/${post.payload.post.id}/reaction`, {
    method: "PUT",
    body: { kind: "love" }
  });
  assert.equal(reaction.response.status, 200);
  const comment = await request(aliceCookie, `/api/posts/${post.payload.post.id}/comments`, {
    method: "POST",
    body: { body: "La agregué a mi lista." }
  });
  assert.equal(comment.response.status, 201);
  const search = await request(aliceCookie, "/api/search?q=R%C3%ADo%20de%20lim%C3%B3n");
  assert.ok(search.payload.tracks.some((track) => track.id === "rio-de-limon"));
  const filteredSearch = await request(aliceCookie, "/api/search?q=R%C3%ADo%20de%20lim%C3%B3n&type=tracks");
  assert.ok(filteredSearch.payload.tracks.some((track) => track.id === "rio-de-limon"));
  assert.equal(filteredSearch.payload.users.length, 0);
  const invalidSearchType = await request(aliceCookie, "/api/search?q=R%C3%ADo&type=unknown");
  assert.equal(invalidSearchType.response.status, 400);
  const report = await request(aliceCookie, "/api/reports", {
    method: "POST",
    body: { postId: post.payload.post.id, reason: "Esta publicación necesita revisión." }
  });
  assert.equal(report.response.status, 201);

  const collection = await request(aliceCookie, "/api/collections", {
    method: "POST",
    body: { name: "Para volver" }
  });
  const savedTrack = await request(aliceCookie, `/api/collections/${collection.payload.collection.id}/tracks`, {
    method: "POST",
    body: { trackId: "rio-de-limon" }
  });
  assert.equal(savedTrack.response.status, 200);
  const collections = await request(aliceCookie, "/api/collections");
  assert.equal(collections.payload.collections[0].tracks[0].id, "rio-de-limon");
  const renameCollection = await request(aliceCookie, `/api/collections/${collection.payload.collection.id}`, {
    method: "PATCH",
    body: { name: "Para escuchar" }
  });
  assert.equal(renameCollection.payload.collection.name, "Para escuchar");
  const forbiddenRename = await request(bobCookie, `/api/collections/${collection.payload.collection.id}`, {
    method: "PATCH",
    body: { name: "No es mía" }
  });
  assert.equal(forbiddenRename.response.status, 404);

  const offlineMessage = await request(aliceCookie, `/api/messages/${bob.id}`, {
    method: "POST",
    body: { body: "Te escribo mientras vuelves.", clientMessageId: "a1b2c3d4-e5f6-4789-abcd-ef0123456789" }
  });
  assert.equal(offlineMessage.payload.message.status, "sent");
  const duplicateMessage = await request(aliceCookie, `/api/messages/${bob.id}`, {
    method: "POST",
    body: { body: "Te escribo mientras vuelves.", clientMessageId: "a1b2c3d4-e5f6-4789-abcd-ef0123456789" }
  });
  assert.equal(duplicateMessage.payload.message.id, offlineMessage.payload.message.id);
  const conflictingMessage = await request(aliceCookie, `/api/messages/${bob.id}`, {
    method: "POST",
    body: { body: "Otro texto", clientMessageId: "a1b2c3d4-e5f6-4789-abcd-ef0123456789" }
  });
  assert.equal(conflictingMessage.response.status, 409);
  const socketAlice = await connectSocket(aliceCookie);
  let socketBob;
  try {
    const delivery = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("No se confirmó la entrega al reconectar.")), 3000);
      socketAlice.once("message:status", (status) => {
        clearTimeout(timer);
        resolve(status);
      });
    });
    socketBob = await connectSocket(bobCookie);
    const deliveryStatus = await delivery;
    assert.equal(deliveryStatus.id, offlineMessage.payload.message.id);
    assert.equal(deliveryStatus.status, "delivered");

    const incoming = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("No llegó el mensaje en tiempo real.")), 3000);
      socketBob.once("message:new", (message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
    const acknowledged = new Promise((resolve, reject) => {
      socketAlice.timeout(3000).emit("message:send", {
        recipientId: bob.id,
        body: "¿Qué estás escuchando?",
        clientMessageId: "b2c3d4e5-f607-489a-bcde-f0123456789a"
      }, (error, result) => {
        if (error) return reject(error);
        if (result?.error) return reject(new Error(result.error));
        resolve(result.message);
      });
    });
    const [received, sent] = await Promise.all([incoming, acknowledged]);
    assert.equal(received.id, sent.id);
    assert.equal(received.body, "¿Qué estás escuchando?");
    assert.equal(received.status, "delivered");
  } finally {
    socketAlice.disconnect();
    socketBob?.disconnect();
  }

  const inbox = await request(bobCookie, `/api/messages/${alice.id}`);
  assert.equal(inbox.payload.messages.length, 2);
  assert.equal(inbox.payload.messages[0].body, "Te escribo mientras vuelves.");
  assert.equal(inbox.payload.messages[0].status, "delivered");
  assert.equal(inbox.payload.messages[1].body, "¿Qué estás escuchando?");
  const messageReport = await request(aliceCookie, "/api/reports", {
    method: "POST",
    body: { messageId: offlineMessage.payload.message.id, reason: "Necesita revisión por la comunidad." }
  });
  assert.equal(messageReport.response.status, 201);
  const notifications = await request(bobCookie, "/api/notifications");
  assert.ok(notifications.payload.notifications.some((item) => item.kind === "message"));
  const markRead = await request(bobCookie, "/api/notifications/read", { method: "POST", body: {} });
  assert.equal(markRead.response.status, 200);
  const readNotifications = await request(bobCookie, "/api/notifications");
  assert.ok(readNotifications.payload.notifications.every((item) => item.isRead));

  const blocked = await request(bobCookie, `/api/users/${alice.id}/block`, { method: "POST", body: {} });
  assert.equal(blocked.response.status, 200);
  const blockedMessage = await request(aliceCookie, `/api/messages/${bob.id}`, {
    method: "POST",
    body: { body: "Este mensaje no debe llegar.", clientMessageId: "c3d4e5f6-0718-49ab-cdef-0123456789ab" }
  });
  assert.equal(blockedMessage.response.status, 403);
  const hiddenProfile = await request(aliceCookie, `/api/users/${bob.id}`);
  assert.equal(hiddenProfile.response.status, 404);

  const logout = await request(aliceCookie, "/api/auth/logout", { method: "POST", body: {} });
  assert.equal(logout.response.status, 200);
  const invalidated = await request(aliceCookie, "/api/me");
  assert.equal(invalidated.response.status, 401);

  const client = await fetch(`${baseUrl}/app.js`);
  assert.equal(client.status, 200);
  assert.match(await client.text(), /function esc\(value\)/);
});
