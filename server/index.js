import { randomBytes, scrypt as scryptCallback, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { Server as SocketServer } from "socket.io";
import { CATALOG, GENRES, TRACK_BY_ID } from "./catalog.js";
import { createStore } from "./store.js";
import { scoreRecommendations, similarityPercent } from "./recommendations.js";

const scrypt = promisify(scryptCallback);
const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIE_NAME = "sonora_session";
const SESSION_DAYS = 30;
const MAX_BIO_LENGTH = 280;
const MAX_POST_LENGTH = 1000;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_SOCKET_MESSAGES_PER_MINUTE = 40;
const MESSAGE_RATE_WINDOW_MS = 60_000;

function isValidMessageId(value) {
  return typeof value === "string" && /^[a-f0-9-]{16,64}$/i.test(value);
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function sessionCookie(token, secure) {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(secure) {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

function getCookie(req, name = COOKIE_NAME) {
  const cookieHeader = req.headers.cookie ?? "";
  const pair = cookieHeader.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : null;
}

function safeUser(row, includePrivate = true) {
  if (!row) return null;
  let interests = [];
  try {
    const parsed = JSON.parse(row.interests ?? "[]");
    if (Array.isArray(parsed)) interests = parsed;
  } catch {
    interests = [];
  }
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: includePrivate ? row.bio : "",
    avatarUrl: row.avatar_url,
    interests: includePrivate ? interests : [],
    isPrivate: Boolean(row.is_private),
    allowDm: Boolean(row.allow_dm),
    createdAt: row.created_at
  };
}

function safeMessage(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    body: row.body,
    status: row.status,
    createdAt: row.created_at
  };
}

function publicTrack(trackId) {
  const track = TRACK_BY_ID.get(trackId);
  return track ?? null;
}

function validateInterests(value) {
  if (!Array.isArray(value) || value.length > GENRES.length) return null;
  if (value.some((genre) => typeof genre !== "string" || !GENRES.includes(genre))) return null;
  return [...new Set(value)];
}

function isValidAvatar(value) {
  if (value === null || value === "") return true;
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function notify(db, userId, actorId, kind, message, postId = null) {
  if (userId === actorId) return;
  db.prepare(`
    INSERT INTO notifications (user_id, actor_id, kind, message, post_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, actorId, kind, message, postId);
}

function blockedBetween(db, firstId, secondId) {
  return Boolean(db.prepare(`
    SELECT 1 FROM blocks
    WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
  `).get(firstId, secondId, secondId, firstId));
}

function isFollowing(db, followerId, followedId) {
  return Boolean(db.prepare("SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?").get(followerId, followedId));
}

function canMessage(db, senderId, recipient) {
  return recipient && recipient.id !== senderId && Boolean(recipient.allow_dm) && !blockedBetween(db, senderId, recipient.id);
}

function postSummary(db, row, viewerId) {
  const author = db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
  const reactionRows = db.prepare("SELECT kind, COUNT(*) AS count FROM reactions WHERE post_id = ? GROUP BY kind").all(row.id);
  const comments = db.prepare(`
    SELECT c.id, c.user_id, u.username, u.display_name, c.body, c.created_at
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ? ORDER BY c.id ASC LIMIT 20
  `).all(row.id);
  const track = row.track_id ? publicTrack(row.track_id) : null;
  return {
    id: row.id,
    author: safeUser(author),
    body: row.body,
    track,
    createdAt: row.created_at,
    reactions: Object.fromEntries(reactionRows.map((item) => [item.kind, item.count])),
    myReaction: db.prepare("SELECT kind FROM reactions WHERE post_id = ? AND user_id = ?").get(row.id, viewerId)?.kind ?? null,
    comments: comments.map((comment) => ({
      id: comment.id,
      userId: comment.user_id,
      username: comment.username,
      displayName: comment.display_name,
      body: comment.body,
      createdAt: comment.created_at
    }))
  };
}

function currentUser(db, req) {
  const token = getCookie(req);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db.prepare(`
    SELECT u.*, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(hashToken(token), Date.now());
  return row ? safeUser(row) : null;
}

function requireAuth(db) {
  return (req, res, next) => {
    const user = currentUser(db, req);
    if (!user) return res.status(401).json({ error: "Inicia sesión para continuar." });
    req.user = user;
    next();
  };
}

function validateSameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin) return next();
  try {
    const url = new URL(origin);
    if (url.host !== req.get("host") || !["http:", "https:"].includes(url.protocol)) {
      return res.status(403).json({ error: "La solicitud de otro origen fue rechazada." });
    }
  } catch {
    return res.status(403).json({ error: "El origen de la solicitud no es válido." });
  }
  next();
}

function createMessage(db, io, senderId, recipientId, body, clientMessageId) {
  const recipient = db.prepare("SELECT * FROM users WHERE id = ?").get(recipientId);
  if (!canMessage(db, senderId, recipient)) {
    const error = new Error("No es posible enviar un mensaje a esta persona.");
    error.status = 403;
    throw error;
  }

  const existing = clientMessageId
    ? db.prepare("SELECT * FROM messages WHERE sender_id = ? AND client_message_id = ?").get(senderId, clientMessageId)
    : null;
  if (existing) {
    if (existing.recipient_id !== recipientId || existing.body !== body) {
      const error = new Error("Este identificador ya se usó para otro mensaje.");
      error.status = 409;
      throw error;
    }
    return safeMessage(existing);
  }

  const delivered = Boolean(io.sockets.adapter.rooms.get(`user:${recipientId}`)?.size);
  const result = db.prepare(`
    INSERT INTO messages (sender_id, recipient_id, client_message_id, body, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(senderId, recipientId, clientMessageId, body, delivered ? "delivered" : "sent");
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(Number(result.lastInsertRowid));
  const message = safeMessage(row);
  notify(db, recipientId, senderId, "message", "Te envió un mensaje.");
  io.to(`user:${recipientId}`).emit("message:new", message);
  return message;
}

export function createApplication({ databasePath } = {}) {
  const { db, close } = createStore(databasePath);
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketServer(httpServer, {
    maxHttpBufferSize: 16_384,
    serveClient: true
  });
  const auth = requireAuth(db);
  const secureCookie = process.env.NODE_ENV === "production";

  app.disable("x-powered-by");
  app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 0));
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "https:", "data:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.json({ limit: "16kb", strict: true }));
  app.use(validateSameOrigin);
  app.use("/api", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Has enviado demasiadas solicitudes. Inténtalo más tarde." }
  }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Demasiados intentos. Espera un momento antes de volver a intentar." }
  });

  io.use((socket, next) => {
    const origin = socket.handshake.headers.origin;
    const host = socket.handshake.headers.host;
    if (origin) {
      try {
        if (new URL(origin).host !== host) return next(new Error("Origen no permitido."));
      } catch {
        return next(new Error("Origen no válido."));
      }
    }
    const token = getCookie({ headers: socket.handshake.headers });
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return next(new Error("Autenticación requerida."));
    const row = db.prepare(`
      SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?
    `).get(hashToken(token), Date.now());
    if (!row) return next(new Error("Sesión expirada."));
    socket.data.userId = row.user_id;
    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    socket.data.messageTimes = [];
    socket.join(`user:${userId}`);
    const pending = db.prepare(`
      SELECT id, sender_id FROM messages WHERE recipient_id = ? AND status = 'sent'
    `).all(userId);
    if (pending.length) {
      db.prepare("UPDATE messages SET status = 'delivered' WHERE recipient_id = ? AND status = 'sent'").run(userId);
      for (const item of pending) {
        io.to(`user:${item.sender_id}`).emit("message:status", { id: item.id, status: "delivered" });
      }
    }

    socket.on("message:send", (payload, acknowledge) => {
      const reply = typeof acknowledge === "function" ? acknowledge : () => {};
      try {
        const recipientId = Number(payload?.recipientId);
        const body = typeof payload?.body === "string" ? payload.body.trim() : "";
        const clientMessageId = payload?.clientMessageId;
        if (!Number.isSafeInteger(recipientId) || body.length < 1 || body.length > MAX_MESSAGE_LENGTH
          || !isValidMessageId(clientMessageId)) {
          return reply({ error: "Revisa la persona y el texto del mensaje." });
        }
        const now = Date.now();
        socket.data.messageTimes = socket.data.messageTimes.filter((sentAt) => now - sentAt < MESSAGE_RATE_WINDOW_MS);
        if (socket.data.messageTimes.length >= MAX_SOCKET_MESSAGES_PER_MINUTE) {
          return reply({ error: "Has enviado muchos mensajes en poco tiempo. Inténtalo más tarde." });
        }
        socket.data.messageTimes.push(now);
        const message = createMessage(db, io, userId, recipientId, body, clientMessageId);
        reply({ message });
      } catch (error) {
        reply({ error: error.message || "No se pudo enviar el mensaje." });
      }
    });
  });

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/catalog", (_req, res) => res.json({ genres: GENRES, tracks: CATALOG }));

  app.post("/api/auth/register", authLimiter, async (req, res, next) => {
    try {
      const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
      const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const interests = validateInterests(req.body?.interests ?? []);
      if (!/^[a-z0-9_]{3,24}$/.test(username)) {
        return res.status(400).json({ error: "El usuario debe tener entre 3 y 24 letras, números o guiones bajos." });
      }
      if (displayName.length < 2 || displayName.length > 40) {
        return res.status(400).json({ error: "El nombre visible debe tener entre 2 y 40 caracteres." });
      }
      if (password.length < 10 || password.length > 200) {
        return res.status(400).json({ error: "La contraseña debe tener entre 10 y 200 caracteres." });
      }
      if (!interests) return res.status(400).json({ error: "Selecciona géneros musicales válidos." });
      if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) {
        return res.status(409).json({ error: "Ese nombre de usuario ya está en uso." });
      }
      const salt = randomBytes(16).toString("hex");
      const passwordHash = (await scrypt(password, salt, 64)).toString("hex");
      const result = db.prepare(`
        INSERT INTO users (username, display_name, password_hash, password_salt, interests)
        VALUES (?, ?, ?, ?, ?)
      `).run(username, displayName, passwordHash, salt, JSON.stringify(interests));
      const token = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
        hashToken(token),
        Number(result.lastInsertRowid),
        Date.now() + SESSION_DAYS * 86400_000
      );
      res.setHeader("Set-Cookie", sessionCookie(token, secureCookie));
      return res.status(201).json({ user: safeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(Number(result.lastInsertRowid))) });
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Ese nombre de usuario ya está en uso." });
      next(error);
    }
  });

  app.post("/api/auth/login", authLimiter, async (req, res, next) => {
    try {
      const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
      if (!row || password.length > 200) return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
      const candidate = await scrypt(password, row.password_salt, 64);
      const actual = Buffer.from(row.password_hash, "hex");
      if (candidate.length !== actual.length || !timingSafeEqual(candidate, actual)) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
      }
      const token = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
        hashToken(token),
        row.id,
        Date.now() + SESSION_DAYS * 86400_000
      );
      res.setHeader("Set-Cookie", sessionCookie(token, secureCookie));
      return res.json({ user: safeUser(row) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/session", (req, res) => {
    res.json({ user: currentUser(db, req) });
  });

  app.post("/api/auth/logout", auth, (req, res) => {
    const token = getCookie(req);
    if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    res.setHeader("Set-Cookie", clearSessionCookie(secureCookie));
    res.json({ ok: true });
  });

  app.get("/api/me", auth, (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    res.json({ user: safeUser(user) });
  });

  app.patch("/api/me", auth, (req, res) => {
    const allowed = new Set(["displayName", "bio", "avatarUrl", "interests", "isPrivate", "allowDm"]);
    if (!req.body || typeof req.body !== "object" || Object.keys(req.body).some((key) => !allowed.has(key))) {
      return res.status(400).json({ error: "El perfil contiene campos no permitidos." });
    }
    const current = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    const displayName = req.body.displayName === undefined ? current.display_name : req.body.displayName;
    const bio = req.body.bio === undefined ? current.bio : req.body.bio;
    const avatarUrl = req.body.avatarUrl === undefined ? current.avatar_url : req.body.avatarUrl;
    const interests = req.body.interests === undefined ? JSON.parse(current.interests) : validateInterests(req.body.interests);
    const isPrivate = req.body.isPrivate === undefined ? Boolean(current.is_private) : req.body.isPrivate;
    const allowDm = req.body.allowDm === undefined ? Boolean(current.allow_dm) : req.body.allowDm;
    if (typeof displayName !== "string" || displayName.trim().length < 2 || displayName.trim().length > 40) {
      return res.status(400).json({ error: "El nombre visible debe tener entre 2 y 40 caracteres." });
    }
    if (typeof bio !== "string" || bio.length > MAX_BIO_LENGTH) return res.status(400).json({ error: `La biografía no puede superar ${MAX_BIO_LENGTH} caracteres.` });
    if (!isValidAvatar(avatarUrl)) return res.status(400).json({ error: "La imagen debe ser una URL HTTPS válida." });
    if (!interests) return res.status(400).json({ error: "Selecciona géneros musicales válidos." });
    if (typeof isPrivate !== "boolean" || typeof allowDm !== "boolean") {
      return res.status(400).json({ error: "Las opciones de privacidad deben ser verdaderas o falsas." });
    }
    db.prepare(`
      UPDATE users SET display_name = ?, bio = ?, avatar_url = ?, interests = ?, is_private = ?, allow_dm = ?
      WHERE id = ?
    `).run(displayName.trim(), bio.trim(), avatarUrl || null, JSON.stringify(interests), Number(isPrivate), Number(allowDm), req.user.id);
    res.json({ user: safeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id)) });
  });

  app.get("/api/recommendations", auth, (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 12, 24));
    res.json({ recommendations: scoreRecommendations(db, req.user.id, limit) });
  });

  app.put("/api/recommendations/:trackId/feedback", auth, (req, res) => {
    if (!TRACK_BY_ID.has(req.params.trackId)) return res.status(404).json({ error: "No encontramos esa canción." });
    const action = req.body?.action;
    if (!["like", "dislike", "save", "listened"].includes(action)) {
      return res.status(400).json({ error: "Selecciona una acción válida." });
    }
    db.prepare(`
      INSERT INTO feedback (user_id, track_id, action, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, track_id) DO UPDATE SET action = excluded.action, updated_at = CURRENT_TIMESTAMP
    `).run(req.user.id, req.params.trackId, action);
    res.json({ ok: true, trackId: req.params.trackId, action });
  });

  app.get("/api/feed", auth, (req, res) => {
    const rows = db.prepare(`
      SELECT p.* FROM posts p
      WHERE (p.user_id = ? OR p.user_id IN (SELECT followed_id FROM follows WHERE follower_id = ?))
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = ? AND b.blocked_id = p.user_id)
             OR (b.blocker_id = p.user_id AND b.blocked_id = ?)
        )
        AND (p.user_id = ? OR p.user_id NOT IN (SELECT id FROM users WHERE is_private = 1)
             OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followed_id = p.user_id))
      ORDER BY p.id DESC LIMIT 40
    `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);
    res.json({
      posts: rows.map((row) => postSummary(db, row, req.user.id)),
      recommendations: scoreRecommendations(db, req.user.id, 12)
    });
  });

  app.get("/api/users", auth, (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const rows = db.prepare(`
      SELECT u.* FROM users u
      WHERE u.id != ? AND (u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = ? AND b.blocked_id = u.id)
             OR (b.blocker_id = u.id AND b.blocked_id = ?)
        )
      ORDER BY u.username LIMIT 30
    `).all(req.user.id, pattern, pattern, req.user.id, req.user.id);
    const own = db.prepare("SELECT interests FROM users WHERE id = ?").get(req.user.id).interests;
    res.json({
      users: rows.map((row) => ({
        ...safeUser(row, !row.is_private || isFollowing(db, req.user.id, row.id)),
        followed: isFollowing(db, req.user.id, row.id),
        requestPending: Boolean(db.prepare("SELECT 1 FROM follow_requests WHERE requester_id = ? AND target_id = ?").get(req.user.id, row.id)),
        affinity: similarityPercent(own, row.interests)
      }))
    });
  });

  app.get("/api/users/:id", auth, (req, res) => {
    const targetId = Number(req.params.id);
    if (!Number.isSafeInteger(targetId)) return res.status(400).json({ error: "El perfil solicitado no es válido." });
    if (blockedBetween(db, req.user.id, targetId)) return res.status(404).json({ error: "No encontramos ese perfil." });
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(targetId);
    if (!row) return res.status(404).json({ error: "No encontramos ese perfil." });
    const followed = isFollowing(db, req.user.id, targetId);
    const owner = targetId === req.user.id;
    const canSeePrivate = owner || !row.is_private || followed;
    const requestPending = Boolean(db.prepare("SELECT 1 FROM follow_requests WHERE requester_id = ? AND target_id = ?").get(req.user.id, targetId));
    const posts = canSeePrivate ? db.prepare("SELECT * FROM posts WHERE user_id = ? ORDER BY id DESC LIMIT 30").all(targetId) : [];
    res.json({
      user: safeUser(row, canSeePrivate),
      followed,
      followingYou: isFollowing(db, targetId, req.user.id),
      requestPending,
      affinity: similarityPercent(db.prepare("SELECT interests FROM users WHERE id = ?").get(req.user.id).interests, row.interests),
      posts: posts.map((post) => postSummary(db, post, req.user.id))
    });
  });

  app.post("/api/users/:id/follow", auth, (req, res) => {
    const targetId = Number(req.params.id);
    const target = Number.isSafeInteger(targetId) ? db.prepare("SELECT * FROM users WHERE id = ?").get(targetId) : null;
    if (!target || targetId === req.user.id) return res.status(404).json({ error: "No encontramos ese perfil." });
    if (blockedBetween(db, req.user.id, targetId)) return res.status(403).json({ error: "No puedes seguir este perfil." });
    if (target.is_private) {
      db.prepare("INSERT OR IGNORE INTO follow_requests (requester_id, target_id) VALUES (?, ?)").run(req.user.id, targetId);
      notify(db, targetId, req.user.id, "follow_request", "Quiere seguir tu perfil.");
      return res.status(202).json({ pending: true });
    }
    db.prepare("INSERT OR IGNORE INTO follows (follower_id, followed_id) VALUES (?, ?)").run(req.user.id, targetId);
    notify(db, targetId, req.user.id, "follow", "Empezó a seguirte.");
    res.json({ followed: true });
  });

  app.delete("/api/users/:id/follow", auth, (req, res) => {
    const targetId = Number(req.params.id);
    if (!Number.isSafeInteger(targetId)) return res.status(400).json({ error: "El perfil solicitado no es válido." });
    db.prepare("DELETE FROM follows WHERE follower_id = ? AND followed_id = ?").run(req.user.id, targetId);
    db.prepare("DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?").run(req.user.id, targetId);
    res.json({ followed: false });
  });

  app.get("/api/follow-requests", auth, (req, res) => {
    const requests = db.prepare(`
      SELECT r.requester_id, r.created_at, u.* FROM follow_requests r
      JOIN users u ON u.id = r.requester_id
      WHERE r.target_id = ? ORDER BY r.created_at DESC
    `).all(req.user.id);
    res.json({ requests: requests.map((row) => ({ user: safeUser(row), createdAt: row.created_at })) });
  });

  app.post("/api/follow-requests/:id", auth, (req, res) => {
    const requesterId = Number(req.params.id);
    const action = req.body?.action;
    if (!Number.isSafeInteger(requesterId) || !["accept", "decline"].includes(action)) {
      return res.status(400).json({ error: "La solicitud o acción no es válida." });
    }
    const request = db.prepare("SELECT 1 FROM follow_requests WHERE requester_id = ? AND target_id = ?").get(requesterId, req.user.id);
    if (!request) return res.status(404).json({ error: "La solicitud ya no está disponible." });
    if (action === "accept" && !blockedBetween(db, req.user.id, requesterId)) {
      db.prepare("INSERT OR IGNORE INTO follows (follower_id, followed_id) VALUES (?, ?)").run(requesterId, req.user.id);
      notify(db, requesterId, req.user.id, "follow_accepted", "Aceptó tu solicitud de seguimiento.");
    }
    db.prepare("DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?").run(requesterId, req.user.id);
    res.json({ accepted: action === "accept" });
  });

  app.post("/api/posts", auth, (req, res) => {
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const trackId = req.body?.trackId ?? null;
    if (body.length < 1 || body.length > MAX_POST_LENGTH) {
      return res.status(400).json({ error: `La publicación debe tener entre 1 y ${MAX_POST_LENGTH} caracteres.` });
    }
    if (trackId !== null && (typeof trackId !== "string" || !TRACK_BY_ID.has(trackId))) {
      return res.status(400).json({ error: "Selecciona una canción disponible o elimina esa selección." });
    }
    const result = db.prepare("INSERT INTO posts (user_id, body, track_id) VALUES (?, ?, ?)").run(req.user.id, body, trackId);
    const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(Number(result.lastInsertRowid));
    const followers = db.prepare("SELECT follower_id FROM follows WHERE followed_id = ?").all(req.user.id);
    for (const follower of followers) {
      if (!blockedBetween(db, follower.follower_id, req.user.id)) {
        notify(db, follower.follower_id, req.user.id, "post", "Compartió una nueva publicación.", post.id);
      }
    }
    res.status(201).json({ post: postSummary(db, post, req.user.id) });
  });

  app.delete("/api/posts/:id", auth, (req, res) => {
    const postId = Number(req.params.id);
    const result = db.prepare("DELETE FROM posts WHERE id = ? AND user_id = ?").run(postId, req.user.id);
    if (!result.changes) return res.status(404).json({ error: "No encontramos una publicación tuya con ese identificador." });
    res.json({ ok: true });
  });

  app.put("/api/posts/:id/reaction", auth, (req, res) => {
    const postId = Number(req.params.id);
    const kind = req.body?.kind;
    const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(postId);
    if (!post) return res.status(404).json({ error: "No encontramos esa publicación." });
    if (blockedBetween(db, req.user.id, post.user_id)) return res.status(403).json({ error: "No puedes interactuar con esta publicación." });
    if (![null, "like", "love", "fire"].includes(kind)) return res.status(400).json({ error: "Selecciona una reacción válida." });
    if (kind === null) {
      db.prepare("DELETE FROM reactions WHERE post_id = ? AND user_id = ?").run(postId, req.user.id);
    } else {
      db.prepare(`
        INSERT INTO reactions (post_id, user_id, kind) VALUES (?, ?, ?)
        ON CONFLICT(post_id, user_id) DO UPDATE SET kind = excluded.kind, created_at = CURRENT_TIMESTAMP
      `).run(postId, req.user.id, kind);
      notify(db, post.user_id, req.user.id, "reaction", "Reaccionó a tu publicación.", postId);
    }
    res.json({ kind });
  });

  app.post("/api/posts/:id/comments", auth, (req, res) => {
    const postId = Number(req.params.id);
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(postId);
    if (!post) return res.status(404).json({ error: "No encontramos esa publicación." });
    if (blockedBetween(db, req.user.id, post.user_id)) return res.status(403).json({ error: "No puedes comentar esta publicación." });
    if (body.length < 1 || body.length > 500) return res.status(400).json({ error: "El comentario debe tener entre 1 y 500 caracteres." });
    const result = db.prepare("INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)").run(postId, req.user.id, body);
    notify(db, post.user_id, req.user.id, "comment", "Comentó en tu publicación.", postId);
    res.status(201).json({ comment: {
      id: Number(result.lastInsertRowid),
      userId: req.user.id,
      username: req.user.username,
      displayName: req.user.displayName,
      body
    } });
  });

  app.delete("/api/posts/:postId/comments/:commentId", auth, (req, res) => {
    const result = db.prepare("DELETE FROM comments WHERE id = ? AND user_id = ? AND post_id = ?")
      .run(Number(req.params.commentId), req.user.id, Number(req.params.postId));
    if (!result.changes) return res.status(404).json({ error: "No encontramos un comentario tuyo con ese identificador." });
    res.json({ ok: true });
  });

  app.post("/api/users/:id/block", auth, (req, res) => {
    const targetId = Number(req.params.id);
    if (!Number.isSafeInteger(targetId) || targetId === req.user.id || !db.prepare("SELECT 1 FROM users WHERE id = ?").get(targetId)) {
      return res.status(404).json({ error: "No encontramos ese perfil." });
    }
    const insert = db.prepare("INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)").run(req.user.id, targetId);
    if (insert.changes) {
      db.prepare("DELETE FROM follows WHERE (follower_id = ? AND followed_id = ?) OR (follower_id = ? AND followed_id = ?)")
        .run(req.user.id, targetId, targetId, req.user.id);
      db.prepare("DELETE FROM follow_requests WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)")
        .run(req.user.id, targetId, targetId, req.user.id);
    }
    res.json({ blocked: true });
  });

  app.delete("/api/users/:id/block", auth, (req, res) => {
    const targetId = Number(req.params.id);
    db.prepare("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?").run(req.user.id, targetId);
    res.json({ blocked: false });
  });

  app.post("/api/reports", auth, (req, res) => {
    const { userId = null, postId = null, messageId = null } = req.body ?? {};
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const targets = [userId, postId, messageId].filter((value) => value !== null);
    if (targets.length !== 1 || reason.length < 5 || reason.length > 500) {
      return res.status(400).json({ error: "Elige un único contenido para reportar y explica el motivo (5 a 500 caracteres)." });
    }
    const numericUser = userId === null ? null : Number(userId);
    const numericPost = postId === null ? null : Number(postId);
    const numericMessage = messageId === null ? null : Number(messageId);
    if (numericUser !== null && (!Number.isSafeInteger(numericUser) || !db.prepare("SELECT 1 FROM users WHERE id = ?").get(numericUser))) {
      return res.status(404).json({ error: "No encontramos ese perfil." });
    }
    if (numericPost !== null && !db.prepare("SELECT 1 FROM posts WHERE id = ?").get(numericPost)) return res.status(404).json({ error: "No encontramos esa publicación." });
    if (numericMessage !== null && !db.prepare("SELECT 1 FROM messages WHERE id = ? AND (sender_id = ? OR recipient_id = ?)").get(numericMessage, req.user.id, req.user.id)) {
      return res.status(404).json({ error: "No encontramos ese mensaje." });
    }
    db.prepare(`
      INSERT INTO reports (reporter_id, target_user_id, post_id, message_id, reason)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, numericUser, numericPost, numericMessage, reason);
    res.status(201).json({ ok: true });
  });

  app.get("/api/collections", auth, (req, res) => {
    const rows = db.prepare("SELECT * FROM collections WHERE user_id = ? ORDER BY id DESC").all(req.user.id);
    res.json({
      collections: rows.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        tracks: db.prepare("SELECT track_id FROM collection_tracks WHERE collection_id = ? ORDER BY added_at DESC").all(row.id)
          .map(({ track_id }) => publicTrack(track_id)).filter(Boolean)
      }))
    });
  });

  app.post("/api/collections", auth, (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (name.length < 2 || name.length > 50) return res.status(400).json({ error: "El nombre debe tener entre 2 y 50 caracteres." });
    const result = db.prepare("INSERT INTO collections (user_id, name) VALUES (?, ?)").run(req.user.id, name);
    res.status(201).json({ collection: { id: Number(result.lastInsertRowid), name, tracks: [] } });
  });

  app.patch("/api/collections/:id", auth, (req, res) => {
    const collectionId = Number(req.params.id);
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (name.length < 2 || name.length > 50) return res.status(400).json({ error: "El nombre debe tener entre 2 y 50 caracteres." });
    const result = db.prepare("UPDATE collections SET name = ? WHERE id = ? AND user_id = ?").run(name, collectionId, req.user.id);
    if (!result.changes) return res.status(404).json({ error: "No encontramos esa colección." });
    res.json({ collection: { id: collectionId, name } });
  });

  app.delete("/api/collections/:id", auth, (req, res) => {
    const result = db.prepare("DELETE FROM collections WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
    if (!result.changes) return res.status(404).json({ error: "No encontramos esa colección." });
    res.json({ ok: true });
  });

  app.post("/api/collections/:id/tracks", auth, (req, res) => {
    const collectionId = Number(req.params.id);
    const trackId = req.body?.trackId;
    if (!TRACK_BY_ID.has(trackId)) return res.status(400).json({ error: "Selecciona una canción disponible." });
    if (!db.prepare("SELECT 1 FROM collections WHERE id = ? AND user_id = ?").get(collectionId, req.user.id)) {
      return res.status(404).json({ error: "No encontramos esa colección." });
    }
    db.prepare("INSERT OR IGNORE INTO collection_tracks (collection_id, track_id) VALUES (?, ?)").run(collectionId, trackId);
    res.json({ ok: true });
  });

  app.delete("/api/collections/:id/tracks/:trackId", auth, (req, res) => {
    const collectionId = Number(req.params.id);
    if (!db.prepare("SELECT 1 FROM collections WHERE id = ? AND user_id = ?").get(collectionId, req.user.id)) {
      return res.status(404).json({ error: "No encontramos esa colección." });
    }
    db.prepare("DELETE FROM collection_tracks WHERE collection_id = ? AND track_id = ?").run(collectionId, req.params.trackId);
    res.json({ ok: true });
  });

  app.get("/api/notifications", auth, (req, res) => {
    const rows = db.prepare(`
      SELECT n.*, u.username, u.display_name FROM notifications n
      LEFT JOIN users u ON u.id = n.actor_id
      WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 40
    `).all(req.user.id);
    res.json({ notifications: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      message: row.message,
      isRead: Boolean(row.is_read),
      createdAt: row.created_at,
      actor: row.actor_id === null ? null : { id: row.actor_id, username: row.username, displayName: row.display_name },
      postId: row.post_id
    })) });
  });

  app.post("/api/notifications/read", auth, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isSafeInteger).slice(0, 40) : [];
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (${placeholders})`).run(req.user.id, ...ids);
    } else {
      db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.user.id);
    }
    res.json({ ok: true });
  });

  app.get("/api/search", auth, (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
    const type = req.query.type ?? "all";
    if (!["all", "tracks", "people", "posts"].includes(type)) {
      return res.status(400).json({ error: "Selecciona un tipo de búsqueda válido." });
    }
    if (!query) return res.json({ tracks: [], users: [], posts: [] });
    const normalized = query.toLocaleLowerCase();
    const tracks = type === "all" || type === "tracks"
      ? CATALOG.filter((track) => `${track.title} ${track.artist} ${track.genre}`.toLocaleLowerCase().includes(normalized)).slice(0, 12)
      : [];
    const users = type === "all" || type === "people" ? db.prepare(`
      SELECT u.* FROM users u
      WHERE u.id != ? AND (u.username LIKE ? OR u.display_name LIKE ?)
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?))
      LIMIT 10
    `).all(req.user.id, `%${query}%`, `%${query}%`, req.user.id, req.user.id)
      .map((row) => ({ ...safeUser(row, !row.is_private || isFollowing(db, req.user.id, row.id)), followed: isFollowing(db, req.user.id, row.id) }))
      : [];
    const posts = type === "all" || type === "posts" ? db.prepare(`
      SELECT p.* FROM posts p JOIN users u ON u.id = p.user_id
      WHERE p.body LIKE ? AND (p.user_id = ? OR p.user_id IN (SELECT followed_id FROM follows WHERE follower_id = ?) OR u.is_private = 0)
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = p.user_id) OR (b.blocker_id = p.user_id AND b.blocked_id = ?))
      ORDER BY p.id DESC LIMIT 10
    `).all(`%${query}%`, req.user.id, req.user.id, req.user.id, req.user.id).map((row) => postSummary(db, row, req.user.id))
      : [];
    res.json({ tracks, users, posts });
  });

  app.get("/api/conversations", auth, (req, res) => {
    const rows = db.prepare(`
      SELECT u.*,
        (SELECT m.body FROM messages m
         WHERE (m.sender_id = ? AND m.recipient_id = u.id) OR (m.sender_id = u.id AND m.recipient_id = ?)
         ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT m.created_at FROM messages m
         WHERE (m.sender_id = ? AND m.recipient_id = u.id) OR (m.sender_id = u.id AND m.recipient_id = ?)
         ORDER BY m.id DESC LIMIT 1) AS last_at,
        (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id AND m.recipient_id = ? AND m.status = 'sent') AS unread
      FROM users u
      WHERE (EXISTS (SELECT 1 FROM messages m WHERE (m.sender_id = ? AND m.recipient_id = u.id) OR (m.sender_id = u.id AND m.recipient_id = ?)))
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?))
      ORDER BY last_at DESC
    `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);
    res.json({ conversations: rows.map((row) => ({
      user: safeUser(row, !row.is_private || isFollowing(db, req.user.id, row.id)),
      lastMessage: row.last_body,
      lastAt: row.last_at,
      unread: row.unread
    })) });
  });

  app.get("/api/messages/:otherId", auth, (req, res) => {
    const otherId = Number(req.params.otherId);
    const other = Number.isSafeInteger(otherId) ? db.prepare("SELECT * FROM users WHERE id = ?").get(otherId) : null;
    if (!other || blockedBetween(db, req.user.id, otherId)) return res.status(404).json({ error: "No encontramos esta conversación." });
    const pending = db.prepare(`
      SELECT id FROM messages WHERE sender_id = ? AND recipient_id = ? AND status = 'sent'
    `).all(otherId, req.user.id);
    if (pending.length) {
      db.prepare("UPDATE messages SET status = 'delivered' WHERE sender_id = ? AND recipient_id = ? AND status = 'sent'")
        .run(otherId, req.user.id);
      for (const message of pending) {
        io.to(`user:${otherId}`).emit("message:status", { id: message.id, status: "delivered" });
      }
    }
    const rows = db.prepare(`
      SELECT * FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      ORDER BY id DESC LIMIT 100
    `).all(req.user.id, otherId, otherId, req.user.id).reverse();
    res.json({ user: safeUser(other, !other.is_private || isFollowing(db, req.user.id, otherId)), messages: rows.map(safeMessage) });
  });

  app.post("/api/messages/:otherId", auth, (req, res) => {
    const otherId = Number(req.params.otherId);
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const clientMessageId = req.body?.clientMessageId;
    if (!Number.isSafeInteger(otherId) || body.length < 1 || body.length > MAX_MESSAGE_LENGTH
      || !isValidMessageId(clientMessageId)) {
      return res.status(400).json({ error: "Revisa la persona, el texto y el identificador del mensaje." });
    }
    try {
      return res.status(201).json({ message: createMessage(db, io, req.user.id, otherId, body, clientMessageId) });
    } catch (error) {
      return res.status(error.status ?? 500).json({ error: error.message || "No se pudo enviar el mensaje." });
    }
  });

  app.use(express.static(resolve(__dirname, "../public"), {
    index: false,
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
  }));
  app.use((req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "No encontramos esa operación." });
    if (req.method === "GET") return res.sendFile(join(__dirname, "../public/index.html"));
    res.status(404).json({ error: "No encontramos esa página." });
  });
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof SyntaxError && "body" in error) {
      return res.status(400).json({ error: "El cuerpo de la solicitud no contiene JSON válido." });
    }
    console.error("Error de servidor:", error);
    res.status(error.status && Number.isInteger(error.status) ? error.status : 500)
      .json({ error: error.status ? error.message : "Ocurrió un error inesperado. Inténtalo más tarde." });
  });

  return {
    app,
    httpServer,
    io,
    db,
    close() {
      io.close();
      close();
    }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { httpServer, close } = createApplication();
  const port = Number(process.env.PORT ?? 3000);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Sonora disponible en http://localhost:${port}`);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      httpServer.close(() => {
        close();
        process.exit(0);
      });
    });
  }
}
