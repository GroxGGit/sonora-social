const GENRES = ["Indie", "Pop", "Rock", "Jazz", "Electrónica", "Hip-hop", "Folk", "R&B", "Clásica", "Latina"];
const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const state = {
  user: null,
  page: "feed",
  catalog: [],
  genres: GENRES,
  recommendations: [],
  posts: [],
  search: "",
  searchType: "all",
  searchResults: null,
  profile: null,
  conversations: [],
  activeChatId: null,
  messages: [],
  collections: [],
  notifications: [],
  followRequests: [],
  socket: null,
  authMode: "register",
  toastTimer: null
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function newMessageId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join("");
}

function initials(user) {
  return esc((user?.displayName || user?.username || "?").trim().slice(0, 1).toLocaleUpperCase());
}

function avatar(user, large = false) {
  const classes = `avatar${large ? " avatar-large" : ""}`;
  if (user?.avatarUrl) {
    return `<span class="${classes}"><img src="${esc(user.avatarUrl)}" alt="" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="${classes}" aria-hidden="true">${initials(user)}</span>`;
}

function safeDate(value) {
  if (!value) return "";
  const date = new Date(`${String(value).replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "";
  const elapsed = Math.max(0, Date.now() - date.getTime());
  if (elapsed < 60_000) return "ahora";
  if (elapsed < 3_600_000) return `hace ${Math.floor(elapsed / 60_000)} min`;
  if (elapsed < 86_400_000) return `hace ${Math.floor(elapsed / 3_600_000)} h`;
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short" }).format(date);
}

function toastMessage(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    if (response.ok) throw new Error("El servidor devolvió una respuesta no válida.");
  }
  if (!response.ok) {
    const error = new Error(payload.error || "No se pudo completar la solicitud.");
    error.status = response.status;
    if (response.status === 401 && state.user) {
      stopSocket();
      state.user = null;
      render();
    }
    throw error;
  }
  return payload;
}

function json(method, body) {
  return { method, body: JSON.stringify(body) };
}

function trackCard(track, compact = false) {
  return `<article class="track-card" data-track="${esc(track.id)}">
    <span class="track-art" aria-hidden="true">♫</span>
    <div class="track-info">
      <strong>${esc(track.title)}</strong>
      <span>${esc(track.artist)} · ${esc(track.genre)}${track.year ? ` · ${esc(track.year)}` : ""}</span>
      ${compact ? "" : `<div class="track-reason">${esc(track.reason || "Parte de tu catálogo de descubrimiento")}</div>`}
    </div>
    ${compact ? "" : `<div class="track-actions" aria-label="Tu opinión sobre ${esc(track.title)}">
      <button class="round-action" type="button" data-action="feedback" data-kind="like" data-track="${esc(track.id)}" aria-label="Me gusta">♡</button>
      <button class="round-action" type="button" data-action="feedback" data-kind="save" data-track="${esc(track.id)}" aria-label="Guardar canción">＋</button>
      <button class="round-action" type="button" data-action="feedback" data-kind="listened" data-track="${esc(track.id)}" aria-label="Ya la escuché">♫</button>
      <button class="round-action dislike" type="button" data-action="feedback" data-kind="dislike" data-track="${esc(track.id)}" aria-label="No me interesa">×</button>
    </div>`}
  </article>`;
}

function postCard(post) {
  const track = post.track ? `<div class="post-track"><span class="track-art" aria-hidden="true">♫</span>
    <div><strong>${esc(post.track.title)}</strong><span>${esc(post.track.artist)} · ${esc(post.track.genre)}</span></div></div>` : "";
  const commentMarkup = (post.comments || []).map((comment) => `<div class="comment"><span>${avatar({ displayName: comment.displayName })}</span><div><strong>${esc(comment.displayName)}</strong>${esc(comment.body)}</div></div>`).join("");
  const isMine = post.author?.id === state.user?.id;
  const likes = (post.reactions?.like || 0) + (post.reactions?.love || 0) + (post.reactions?.fire || 0);
  return `<article class="card post-card" data-post="${esc(post.id)}">
    <header class="post-author">
      ${avatar(post.author)}
      <div class="post-author-copy"><strong>${esc(post.author?.displayName)}</strong><span>@${esc(post.author?.username)} · ${esc(safeDate(post.createdAt))}</span></div>
    </header>
    <p class="post-copy">${esc(post.body).replace(/\n/g, "<br>")}</p>${track}
    <div class="post-actions">
      <button type="button" class="text-button${post.myReaction ? " selected" : ""}" data-action="react" data-id="${esc(post.id)}" data-kind="${post.myReaction ? "null" : "like"}" aria-pressed="${Boolean(post.myReaction)}">♡ ${likes || ""} Me gusta</button>
      <button type="button" class="text-button" data-action="focus-comment" data-id="${esc(post.id)}">◌ ${(post.comments || []).length || ""} Comentar</button>
      <button type="button" class="text-button more-action" data-action="report-post" data-id="${esc(post.id)}">··· Reportar</button>
      ${isMine ? `<button type="button" class="text-button" data-action="delete-post" data-id="${esc(post.id)}" aria-label="Eliminar publicación">Eliminar</button>` : ""}
    </div>
    ${commentMarkup ? `<div class="comment-list">${commentMarkup}</div>` : ""}
    <form class="comment-form" data-form="comment" data-id="${esc(post.id)}">
      <input name="body" maxlength="500" required placeholder="Escribe un comentario…" aria-label="Escribe un comentario">
      <button class="button button-secondary button-small" type="submit">Enviar</button>
    </form>
  </article>`;
}

function navButton(page, icon, label, badge = 0) {
  const selected = state.page === page;
  return `<button type="button" class="nav-button${selected ? " active" : ""}" data-page="${page}" ${selected ? 'aria-current="page"' : ""}>
    <span class="nav-icon" aria-hidden="true">${icon}</span><span class="nav-label">${label}</span>
    ${badge ? `<span class="nav-badge">${badge > 9 ? "9+" : badge}</span>` : ""}
  </button>`;
}

function shell(title, content, active = state.page) {
  const unread = state.notifications.filter((item) => !item.isRead).length;
  return `<div class="app-shell">
    <aside class="sidebar" aria-label="Navegación principal">
      <a class="brand" href="#" data-page="feed"><span class="brand-mark">♫</span><span class="brand-name">sonora</span></a>
      <nav class="nav-list">
        ${navButton("feed", "⌂", "Inicio")}
        ${navButton("discover", "⌕", "Descubrir")}
        ${navButton("chat", "◌", "Mensajes")}
        ${navButton("profile", "♙", "Mi perfil")}
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-profile" data-page="profile" role="button" tabindex="0" aria-label="Abrir mi perfil">
          ${avatar(state.user)}
          <div class="sidebar-profile-copy"><strong>${esc(state.user?.displayName)}</strong><span>@${esc(state.user?.username)}</span></div>
        </div>
      </div>
    </aside>
    <main class="main-area">
      <header class="topbar"><div><div class="eyebrow">Tu comunidad musical</div><h1>${esc(title)}</h1></div>
        <div class="topbar-actions">
          <button type="button" class="icon-button" data-action="notifications" aria-label="Notificaciones${unread ? `, ${unread} sin leer` : ""}">♧${unread ? '<span class="notification-dot"></span>' : ""}</button>
          <button type="button" class="icon-button" data-action="logout" aria-label="Cerrar sesión">↗</button>
        </div>
      </header>${content}
    </main>
  </div>`;
}

function renderAuth() {
  const signup = state.authMode === "register";
  const fields = signup ? `
    <div class="field"><label for="display-name">Cómo te llamamos</label><input id="display-name" name="displayName" autocomplete="name" maxlength="40" minlength="2" required placeholder="Tu nombre"></div>
    <div class="field"><label for="username">Nombre de usuario</label><input id="username" name="username" autocomplete="username" pattern="[A-Za-z0-9_]{3,24}" maxlength="24" required placeholder="tu_usuario"><span class="field-help">3–24 letras, números o guion bajo.</span></div>
    <div class="field"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="10" maxlength="200" required placeholder="Al menos 10 caracteres"></div>
    <div class="field"><span class="field-label">¿Qué suena contigo?</span><div class="auth-genres">${GENRES.map((genre) => `<label><input type="checkbox" name="interests" value="${esc(genre)}"><span>${esc(genre)}</span></label>`).join("")}</div><span class="field-help">Elige algunos géneros para iniciar tus recomendaciones.</span></div>
  ` : `
    <div class="field"><label for="username">Nombre de usuario</label><input id="username" name="username" autocomplete="username" required placeholder="tu_usuario"></div>
    <div class="field"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>`;
  app.innerHTML = `<main class="auth-page">
    <section class="auth-story"><a class="brand" href="#"><span class="brand-mark">♫</span><span class="brand-name">sonora</span></a>
      <div class="auth-story-copy"><div class="eyebrow">Cada gusto nos acerca</div><h1>La música suena mejor en compañía.</h1><p>Descubre canciones, encuentra personas con tus mismos gustos y crea tu propio rincón musical.</p></div>
      <div class="auth-note">Una comunidad para escuchar, compartir y conectar.</div>
    </section>
    <section class="auth-panel"><form class="auth-form" data-form="auth">
      <div class="eyebrow">${signup ? "Empieza a descubrir" : "Qué bueno verte de nuevo"}</div><h2>${signup ? "Encuentra tu ritmo." : "Entra a Sonora."}</h2>
      <p>${signup ? "Crea tu cuenta y cuéntanos qué música te mueve." : "Inicia sesión para volver a tu comunidad musical."}</p>
      <div class="auth-switch"><button type="button" data-auth-mode="register" class="${signup ? "active" : ""}">Crear cuenta</button><button type="button" data-auth-mode="login" class="${signup ? "" : "active"}">Iniciar sesión</button></div>
      <div class="form-grid">${fields}<div class="auth-error" role="alert"></div><button class="button" type="submit">${signup ? "Crear mi cuenta →" : "Iniciar sesión →"}</button></div>
      ${signup ? '<p class="caption">Al continuar, tus gustos y actividad se usan para personalizar recomendaciones. Puedes cambiar tus preferencias en cualquier momento.</p>' : ""}
    </form></section>
  </main>`;
}

function renderMiniUsers(users) {
  if (!users.length) return `<div class="empty-state">Todavía no hay perfiles para mostrar. Busca a alguien y empieza a conectar.</div>`;
  return users.slice(0, 4).map((user) => `<div class="mini-user">
    ${avatar(user, true)}<div class="mini-user-copy"><strong>${esc(user.displayName)}</strong><span>@${esc(user.username)}${user.affinity ? ` · ${user.affinity}% afín` : ""}</span></div>
    <button class="round-action" type="button" data-action="open-user" data-id="${esc(user.id)}" aria-label="Ver a ${esc(user.displayName)}">→</button>
  </div>`).join("");
}

function renderFeed() {
  const interests = state.user.interests || [];
  const recommendations = state.recommendations;
  const suggested = state.suggestions || [];
  const content = `<div class="content-grid">
    <section class="content-main">
      <article class="card welcome-card">
        <div><div class="eyebrow">Tu descubrimiento de hoy</div><h2>${interests.length ? "Cada canción abre una conversación." : "Empieza por contar qué te gusta."}</h2>
        <p>${interests.length ? "Las recomendaciones se basan en tus gustos y en las decisiones que compartes con Sonora." : "Elige algunos géneros en tu perfil para que podamos armar un feed más tuyo."}</p>
        <button type="button" class="button button-soft button-small" data-page="${interests.length ? "discover" : "profile"}">${interests.length ? "Explorar canciones →" : "Elegir mis gustos →"}</button></div>
        <div class="welcome-art" aria-hidden="true">♫</div>
      </article>
      <form class="card composer" data-form="post">
        <div class="composer-top">${avatar(state.user)}<textarea name="body" maxlength="1000" required aria-label="Comparte una canción o una idea" placeholder="¿Qué canción tienes en repeat?"></textarea></div>
        <div class="composer-bottom"><select class="select-track" name="trackId" aria-label="Añadir una canción"><option value="">＋ Añadir una canción</option>${state.catalog.map((track) => `<option value="${esc(track.id)}">${esc(track.title)} — ${esc(track.artist)}</option>`).join("")}</select><button class="button button-small" type="submit">Publicar</button></div>
      </form>
      <section class="card card-pad">
        <div class="section-heading"><div><h2>Para tu siguiente escucha</h2><p>Tu feed aprende de lo que guardas, escuchas y descartas.</p></div><span class="pill">♫ Para ti</span></div>
        <div class="track-list">${recommendations.length ? recommendations.slice(0, 6).map((track) => trackCard(track)).join("") : `<div class="empty-state">No encontramos recomendaciones por ahora.</div>`}</div>
      </section>
      <section class="content-main" aria-label="Actividad de tu comunidad">
        <div class="section-heading"><div><h2>En tu comunidad</h2><p>Ideas y canciones de las personas que sigues.</p></div></div>
        ${state.posts.length ? state.posts.map(postCard).join("") : `<div class="card empty-state"><strong>Tu feed empieza contigo.</strong>Sigue a personas desde Descubrir o publica la canción que te acompaña hoy.</div>`}
      </section>
    </section>
    <aside class="content-side">
      <section class="card card-pad"><div class="section-heading"><div><h3>Gustos en común</h3><p>Personas que podrían ir con tu playlist.</p></div></div><div>${renderMiniUsers(suggested)}</div><button class="text-button discover-link" data-page="discover" type="button">Descubrir comunidad →</button></section>
      <section class="card card-pad"><div class="section-heading"><div><h3>Tu identidad sonora</h3><p>${interests.length ? "Estos gustos ayudan a orientar tu feed." : "Elige tus primeros géneros."}</p></div></div>
        <div class="genre-list">${interests.length ? interests.map((genre) => `<span class="genre-chip active">${esc(genre)}</span>`).join("") : `<button type="button" class="button button-soft button-small" data-page="profile">Elegir géneros</button>`}</div>
      </section>
      <p class="caption catalog-note">El catálogo de demostración contiene metadatos de canciones; no reproduce ni aloja audio.</p>
    </aside>
  </div>`;
  app.innerHTML = shell("Tu espacio", content, "feed");
}

function renderDiscover() {
  const results = state.searchResults;
  const query = state.search.trim();
  const users = results?.users ?? state.suggestions ?? [];
  const tracks = results?.tracks ?? state.recommendations;
  const posts = results?.posts ?? [];
  const content = `<section class="page-content">
    <form class="search-field" data-form="search"><span aria-hidden="true">⌕</span><input name="query" value="${esc(state.search)}" maxlength="60" placeholder="Busca personas, canciones o publicaciones…" aria-label="Buscar en Sonora">
      <select class="search-type" name="type" aria-label="Tipo de resultado"><option value="all" ${state.searchType === "all" ? "selected" : ""}>Todo</option><option value="tracks" ${state.searchType === "tracks" ? "selected" : ""}>Canciones</option><option value="people" ${state.searchType === "people" ? "selected" : ""}>Personas</option><option value="posts" ${state.searchType === "posts" ? "selected" : ""}>Publicaciones</option></select>
      <button class="button button-small" type="submit">Buscar</button></form>
    ${state.searchType !== "tracks" ? `<section class="card card-pad"><div class="section-heading"><div><h2>${query ? "Personas encontradas" : "Personas que comparten tus gustos"}</h2><p>La afinidad se calcula comparando los géneros que cada persona eligió.</p></div></div>
      <div class="user-list">${renderUserRows(users)}</div></section>
    ` : ""}
    ${state.searchType !== "people" ? `<section class="card card-pad"><div class="section-heading"><div><h2>${query ? "Canciones encontradas" : "Canciones para explorar"}</h2><p>Descubre algo nuevo y cuéntanos qué te pareció.</p></div></div>
      <div class="track-list">${tracks.length ? tracks.slice(0, 8).map((track) => trackCard(track)).join("") : `<div class="empty-state">No encontramos canciones. Prueba otro término.</div>`}</div></section>` : ""}
    ${state.searchType === "posts" || posts.length ? `<section class="content-main"><div class="section-heading"><h2>Publicaciones encontradas</h2></div>${posts.length ? posts.map(postCard).join("") : `<div class="card empty-state">No encontramos publicaciones. Prueba otro término.</div>`}</section>` : ""}
  </section>`;
  app.innerHTML = shell("Descubrir", content, "discover");
}

function renderUserRows(users) {
  if (!users.length) return `<div class="empty-state"><strong>No encontramos personas todavía.</strong>Prueba una búsqueda diferente o invita a alguien a unirse.</div>`;
  return users.map((user) => `<div class="user-row">
    ${avatar(user, true)}
    <button type="button" class="mini-user-copy user-profile-button text-button" data-action="open-user" data-id="${esc(user.id)}"><strong>${esc(user.displayName)}</strong><span>@${esc(user.username)} · ${esc(user.isPrivate ? "Perfil privado" : (user.bio || "Explorando nuevos sonidos"))}</span></button>
    <div class="user-affinity"><strong>${user.affinity ?? 0}%</strong><span>en común</span></div>
    <button type="button" class="button button-secondary button-small" data-action="${user.followed ? "unfollow" : user.requestPending ? "cancel-follow" : "follow"}" data-id="${esc(user.id)}">${user.followed ? "Siguiendo" : user.requestPending ? "Solicitada" : "Seguir"}</button>
  </div>`).join("");
}

function renderProfile() {
  if (state.profile?.user?.id !== state.user.id) return renderOtherProfile();
  const profile = state.profile?.user ?? state.user;
  const requests = state.followRequests || [];
  const collections = state.collections || [];
  const content = `<section class="page-content">
    <article class="card profile-hero">${avatar(profile, true)}<div class="profile-meta"><h2>${esc(profile.displayName)}</h2><p>@${esc(profile.username)} · ${profile.isPrivate ? "Perfil privado" : "Perfil público"}</p><p class="caption">${esc(profile.bio || "Cuéntale a la comunidad qué sueles escuchar.")}</p></div>
      <button type="button" class="button button-secondary button-small" data-action="logout">Cerrar sesión</button></article>
    ${requests.length ? `<section class="card card-pad"><div class="section-heading"><div><h2>Solicitudes para seguirte</h2><p>Revisa quién quiere ver tu perfil privado.</p></div></div>${requests.map((request) => `<div class="user-row">${avatar(request.user)}<div class="mini-user-copy"><strong>${esc(request.user.displayName)}</strong><span>@${esc(request.user.username)}</span></div><button class="button button-small" data-action="follow-request" data-id="${esc(request.user.id)}" data-kind="accept">Aceptar</button><button class="button button-secondary button-small" data-action="follow-request" data-id="${esc(request.user.id)}" data-kind="decline">Ahora no</button></div>`).join("")}</section>` : ""}
    <section class="card card-pad"><div class="section-heading"><div><h2>Tu perfil</h2><p>Cuéntale a otras personas qué música te mueve.</p></div></div>
      <form class="form-grid" data-form="profile">
        <div class="field"><label for="profile-name">Nombre visible</label><input id="profile-name" name="displayName" value="${esc(profile.displayName)}" minlength="2" maxlength="40" required></div>
        <div class="field"><label for="profile-bio">Biografía</label><textarea id="profile-bio" name="bio" maxlength="280" placeholder="Un poco sobre tus gustos musicales…">${esc(profile.bio)}</textarea><span class="field-help">Máximo 280 caracteres.</span></div>
        <div class="field"><label for="avatar-url">URL de imagen (opcional)</label><input id="avatar-url" type="url" name="avatarUrl" value="${esc(profile.avatarUrl || "")}" placeholder="https://…"><span class="field-help">Solo se aceptan direcciones HTTPS.</span></div>
        <div class="field"><span class="field-label">Tus géneros</span><div class="auth-genres">${GENRES.map((genre) => `<label><input type="checkbox" name="interests" value="${esc(genre)}" ${(profile.interests || []).includes(genre) ? "checked" : ""}><span>${esc(genre)}</span></label>`).join("")}</div></div>
        <label class="check-row"><input type="checkbox" name="isPrivate" ${profile.isPrivate ? "checked" : ""}><span><strong>Perfil privado.</strong> Solo tus seguidores aprobados verán tu biografía, gustos y publicaciones. Las solicitudes requerirán tu aprobación.</span></label>
        <label class="check-row"><input type="checkbox" name="allowDm" ${profile.allowDm ? "checked" : ""}><span><strong>Permitir mensajes directos.</strong> Puedes desactivar los mensajes de personas con las que no hay una relación bloqueada.</span></label>
        <div class="form-actions"><button class="button" type="submit">Guardar perfil</button></div>
      </form></section>
    <section class="card card-pad"><div class="section-heading"><div><h2>Tus colecciones</h2><p>Guarda música para volver a escucharla.</p></div></div>
      <form class="comment-form" data-form="collection"><input name="name" minlength="2" maxlength="50" required placeholder="Nombre de una colección" aria-label="Nombre de colección"><button class="button button-small" type="submit">Crear</button></form>
      ${collections.length ? collections.map((collection) => `<div class="collection-card"><div class="collection-heading"><strong>${esc(collection.name)}</strong><div class="form-actions"><button class="text-button" type="button" data-action="rename-collection" data-id="${esc(collection.id)}">Renombrar</button><button class="text-button" type="button" data-action="delete-collection" data-id="${esc(collection.id)}">Eliminar</button></div></div>${collection.tracks.length ? collection.tracks.map((track) => `<div class="collection-track"><span class="track-art" aria-hidden="true">♫</span><span>${esc(track.title)} — ${esc(track.artist)}</span><button class="round-action" data-action="remove-track" data-id="${esc(collection.id)}" data-track="${esc(track.id)}" aria-label="Quitar ${esc(track.title)}">×</button></div>`).join("") : `<span class="caption">Aún no hay canciones en esta colección.</span>`}
        <form class="comment-form" data-form="add-collection-track" data-id="${esc(collection.id)}"><select class="select-track" name="trackId" required aria-label="Canción para agregar a ${esc(collection.name)}"><option value="">Agregar canción…</option>${state.catalog.map((track) => `<option value="${esc(track.id)}">${esc(track.title)} — ${esc(track.artist)}</option>`).join("")}</select><button class="button button-secondary button-small" type="submit">Agregar</button></form>
      </div>`).join("") : `<div class="empty-state">Aún no tienes colecciones. Crea una y guarda tus canciones favoritas.</div>`}
    </section>
    <section class="card card-pad"><div class="section-heading"><div><h2>Tus publicaciones</h2><p>Las ideas que has compartido.</p></div></div>${state.posts.length ? state.posts.filter((post) => post.author.id === state.user.id).map(postCard).join("") || `<div class="empty-state">Todavía no has publicado nada.</div>` : `<div class="empty-state">Todavía no has publicado nada.</div>`}</section>
  </section>`;
  app.innerHTML = shell("Mi perfil", content, "profile");
}

function renderOtherProfile() {
  const profile = state.profile;
  if (!profile) return app.innerHTML = shell("Perfil", `<div class="card empty-state"><strong>Este perfil no está disponible.</strong></div>`, "discover");
  const user = profile.user;
  const relationAction = profile.followed ? "unfollow" : profile.requestPending ? "cancel-follow" : "follow";
  const relationLabel = profile.followed ? "Dejar de seguir" : profile.requestPending ? "Solicitud enviada" : "Seguir";
  const content = `<section class="page-content">
    <article class="card profile-hero">${avatar(user, true)}<div class="profile-meta"><h2>${esc(user.displayName)}</h2><p>@${esc(user.username)} · ${user.isPrivate ? "Perfil privado" : "Perfil público"}</p>
      ${user.isPrivate && !profile.followed ? `<p class="caption">Sigue este perfil para solicitar acceso a sus publicaciones y gustos.</p>` : `<p class="caption">${esc(user.bio || "Amante de la música y los nuevos descubrimientos.")}</p>`}
      ${user.interests?.length ? `<div class="genre-list">${user.interests.map((genre) => `<span class="genre-chip active">${esc(genre)}</span>`).join("")}</div>` : ""}</div>
      <span class="pill">${profile.affinity}% afinidad</span></article>
    <div class="form-actions"><button class="button" data-action="${relationAction}" data-id="${esc(user.id)}" ${profile.requestPending ? "disabled" : ""}>${relationLabel}</button>
      ${profile.followed && user.allowDm ? `<button class="button button-secondary" data-action="start-chat" data-id="${esc(user.id)}">Enviar mensaje</button>` : ""}
      <button class="button button-secondary button-small" data-action="report-user" data-id="${esc(user.id)}">Reportar perfil</button>
      <button class="button button-danger button-small" data-action="block-user" data-id="${esc(user.id)}">Bloquear</button></div>
    <section class="content-main"><div class="section-heading"><h2>Publicaciones</h2></div>${profile.posts?.length ? profile.posts.map(postCard).join("") : `<div class="card empty-state">${user.isPrivate && !profile.followed ? "Sigue a esta persona para ver sus publicaciones." : "Esta persona todavía no tiene publicaciones."}</div>`}</section>
  </section>`;
  app.innerHTML = shell("Perfil", content, "discover");
}

function renderChat() {
  const active = state.conversations.find((item) => item.user.id === state.activeChatId);
  const content = `<section class="page-content">
    <div class="card chat-layout" data-active="${Boolean(active)}">
      <aside class="chat-list"><h2>Conversaciones</h2>${state.conversations.length ? state.conversations.map((conversation) => `<button type="button" class="conversation-button${state.activeChatId === conversation.user.id ? " active" : ""}" data-action="open-chat" data-id="${esc(conversation.user.id)}">
        ${avatar(conversation.user)}<span class="conversation-copy"><strong>${esc(conversation.user.displayName)}</strong><span>${esc(conversation.lastMessage || "Saluda y comparte una canción")}</span></span>${conversation.unread ? `<span class="unread-count">${conversation.unread}</span>` : ""}
      </button>`).join("") : `<div class="empty-state">Todavía no tienes conversaciones.<br>Busca personas en Descubrir para empezar.</div>`}</aside>
      <section class="chat-pane">
        ${active ? `<header class="chat-top"><button class="icon-button chat-back" type="button" data-action="chat-back" aria-label="Volver a conversaciones">←</button>${avatar(active.user)}<div><strong>${esc(active.user.displayName)}</strong><span>@${esc(active.user.username)} · Los mensajes quedan guardados en esta cuenta</span></div></header>
          <div class="chat-messages" id="chat-messages" aria-live="polite">${state.messages.length ? state.messages.map(renderMessage).join("") : `<div class="chat-empty">Este es el comienzo de la conversación.<br>Comparte una canción que te guste.</div>`}</div>
          <form class="chat-send" data-form="message" data-id="${esc(active.user.id)}"><input type="hidden" name="clientMessageId" value="${esc(newMessageId())}"><input name="body" maxlength="1000" required placeholder="Escribe un mensaje…" aria-label="Escribe un mensaje"><button class="button button-small" type="submit" aria-label="Enviar mensaje">Enviar ↑</button></form>`
          : `<div class="chat-empty">Elige una conversación para ponerte al día.<br>Tu chat está listo para hablar de música.</div>`}
      </section>
    </div>
  </section>`;
  app.innerHTML = shell("Mensajes", content, "chat");
  scrollChatToBottom();
}

function renderMessage(message) {
  const mine = message.senderId === state.user.id;
  const date = safeDate(message.createdAt);
  const delivery = mine ? (message.status === "delivered" ? " · Entregado" : " · Enviado") : "";
  return `<div class="message${mine ? " mine" : ""}" data-message="${esc(message.id)}">${esc(message.body)}${mine ? "" : `<button class="message-report" type="button" data-action="report-message" data-id="${esc(message.id)}">Reportar</button>`}<time>${esc(date)}${delivery}</time></div>`;
}

function renderNotifications() {
  const list = state.notifications;
  const requests = state.followRequests || [];
  const content = `<section class="page-content">
    ${requests.length ? `<section class="card card-pad"><div class="section-heading"><div><h2>Solicitudes de seguimiento</h2><p>Las personas quieren seguir tu perfil privado.</p></div></div>${requests.map((request) => `<div class="user-row">${avatar(request.user)}<div class="mini-user-copy"><strong>${esc(request.user.displayName)}</strong><span>@${esc(request.user.username)}</span></div><button class="button button-small" data-action="follow-request" data-id="${esc(request.user.id)}" data-kind="accept">Aceptar</button><button class="button button-secondary button-small" data-action="follow-request" data-id="${esc(request.user.id)}" data-kind="decline">Rechazar</button></div>`).join("")}</section>` : ""}
    <section class="card card-pad"><div class="section-heading"><div><h2>Notificaciones</h2><p>Actividad nueva de tu comunidad.</p></div><button class="text-button" data-action="read-notifications">Marcar todas como leídas</button></div>
      ${list.length ? `<div class="notification-list">${list.map((item) => `<div class="notification-row${item.isRead ? "" : " unread"}">${avatar(item.actor)}<div class="notification-copy">${item.actor ? `<strong>${esc(item.actor.displayName)}</strong> ` : ""}${esc(item.message)}<span>${esc(safeDate(item.createdAt))}</span></div>${!item.isRead ? `<span class="pill">Nueva</span>` : ""}</div>`).join("")}</div>` : `<div class="empty-state"><strong>Todo al día.</strong>Cuando haya novedades, aparecerán aquí.</div>`}
    </section>
  </section>`;
  app.innerHTML = shell("Notificaciones", content);
}

async function refreshCommon() {
  const [catalog, feed, people, notifications, followRequests, collections] = await Promise.all([
    api("/api/catalog"),
    api("/api/feed"),
    api("/api/users?q="),
    api("/api/notifications"),
    api("/api/follow-requests"),
    api("/api/collections")
  ]);
  state.catalog = catalog.tracks;
  state.genres = catalog.genres;
  state.posts = feed.posts;
  state.recommendations = feed.recommendations;
  state.suggestions = people.users;
  state.notifications = notifications.notifications;
  state.followRequests = followRequests.requests;
  state.collections = collections.collections;
}

async function loadPage(page = state.page) {
  state.page = page;
  try {
    if (page === "feed") {
      await refreshCommon();
      renderFeed();
      return;
    }
    if (page === "discover") {
      if (!state.catalog.length) await refreshCommon();
      if (state.search.trim()) {
        state.searchResults = await api(`/api/search?q=${encodeURIComponent(state.search.trim())}&type=${encodeURIComponent(state.searchType)}`);
      } else {
        state.searchResults = null;
        const [people, recommendations] = await Promise.all([api("/api/users?q="), api("/api/recommendations")]);
        state.suggestions = people.users;
        state.recommendations = recommendations.recommendations;
      }
      renderDiscover();
      return;
    }
    if (page === "profile") {
      const [profile, requests, collections, feed] = await Promise.all([
        api("/api/me"),
        api("/api/follow-requests"),
        api("/api/collections"),
        api("/api/feed")
      ]);
      state.user = profile.user;
      state.profile = { user: profile.user };
      state.followRequests = requests.requests;
      state.collections = collections.collections;
      state.posts = feed.posts;
      if (!state.catalog.length) state.catalog = (await api("/api/catalog")).tracks;
      renderProfile();
      return;
    }
    if (page === "chat") {
      const result = await api("/api/conversations");
      state.conversations = result.conversations;
      if (state.activeChatId) {
        const active = result.conversations.find((item) => item.user.id === state.activeChatId);
        if (active) state.messages = (await api(`/api/messages/${active.user.id}`)).messages;
        else { state.activeChatId = null; state.messages = []; }
      }
      renderChat();
      return;
    }
    if (page === "notifications") {
      const [notifications, requests] = await Promise.all([api("/api/notifications"), api("/api/follow-requests")]);
      state.notifications = notifications.notifications;
      state.followRequests = requests.requests;
      renderNotifications();
    }
  } catch (error) {
    toastMessage(error.message, true);
    if (state.user) app.innerHTML = shell("Sonora", `<div class="card empty-state"><strong>No pudimos cargar esta sección.</strong>${esc(error.message)}<br><button class="button button-secondary button-small" data-action="retry">Intentar de nuevo</button></div>`);
  }
}

function render() {
  if (!state.user) return renderAuth();
  loadPage(state.page);
}

function startSocket() {
  if (!window.io || state.socket) return;
  state.socket = window.io({ withCredentials: true, reconnection: true, timeout: 5000 });
  state.socket.on("connect_error", () => {});
  state.socket.on("message:new", (message) => {
    if (message.senderId === state.user.id) return;
    if (state.page === "chat" && state.activeChatId === message.senderId) {
      if (!state.messages.some((item) => item.id === message.id)) state.messages.push(message);
      updateChatMessages();
      api(`/api/messages/${message.senderId}`).catch((error) => toastMessage(error.message, true));
    }
    if (state.page === "chat") loadPage("chat");
    else {
      state.notifications.unshift({ id: `live-${message.id}`, actor: null, message: "Tienes un mensaje nuevo.", isRead: false, createdAt: message.createdAt });
    }
  });
  state.socket.on("message:status", ({ id, status }) => {
    const message = state.messages.find((item) => item.id === id);
    if (message) {
      message.status = status;
      updateChatMessages();
    }
  });
}

function stopSocket() {
  if (state.socket) state.socket.disconnect();
  state.socket = null;
}

function scrollChatToBottom() {
  const panel = document.querySelector("#chat-messages");
  if (panel) panel.scrollTop = panel.scrollHeight;
}

function updateChatMessages() {
  const panel = document.querySelector("#chat-messages");
  if (!panel) return;
  panel.innerHTML = state.messages.map(renderMessage).join("") || `<div class="chat-empty">Este es el comienzo de la conversación.<br>Comparte una canción que te guste.</div>`;
  scrollChatToBottom();
}

async function openUser(id) {
  try {
    state.profile = await api(`/api/users/${id}`);
    state.page = "other-profile";
    renderOtherProfile();
  } catch (error) {
    toastMessage(error.message, true);
  }
}

async function setFollow(id, shouldFollow) {
  if (shouldFollow) {
    const response = await api(`/api/users/${id}/follow`, json("POST", {}));
    toastMessage(response.pending ? "Solicitud enviada." : "Ya sigues este perfil.");
  } else {
    await api(`/api/users/${id}/follow`, { method: "DELETE" });
    toastMessage("Dejaste de seguir este perfil.");
  }
  if (state.page === "other-profile") await openUser(id);
  else await loadPage(state.page);
}

async function switchChat(id) {
  state.activeChatId = Number(id);
  try {
    const result = await api(`/api/messages/${id}`);
    state.messages = result.messages;
    await loadPage("chat");
  } catch (error) {
    toastMessage(error.message, true);
  }
}

app.addEventListener("click", async (event) => {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) {
    event.preventDefault();
    const page = pageButton.dataset.page;
    if (page === "profile") state.profile = { user: state.user };
    state.search = "";
    state.searchResults = null;
    await loadPage(page);
    return;
  }
  const modeButton = event.target.closest("[data-auth-mode]");
  if (modeButton) {
    state.authMode = modeButton.dataset.authMode;
    renderAuth();
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id, kind, track } = button.dataset;
  try {
    if (action === "logout") {
      await api("/api/auth/logout", json("POST", {}));
      stopSocket();
      state.user = null;
      state.page = "feed";
      render();
    } else if (action === "feedback") {
      await api(`/api/recommendations/${encodeURIComponent(track)}/feedback`, json("PUT", { action: kind }));
      toastMessage(kind === "dislike" ? "Lo tendremos en cuenta para tus próximas recomendaciones." : "Actualizamos tu feed.");
      await loadPage(state.page);
    } else if (action === "react") {
      await api(`/api/posts/${id}/reaction`, json("PUT", { kind: kind === "null" ? null : kind }));
      await loadPage(state.page);
    } else if (action === "focus-comment") {
      document.querySelector(`[data-form="comment"][data-id="${CSS.escape(id)}"] input`)?.focus();
    } else if (action === "delete-post") {
      if (!window.confirm("¿Quieres eliminar esta publicación?")) return;
      await api(`/api/posts/${id}`, { method: "DELETE" });
      toastMessage("Publicación eliminada.");
      await loadPage(state.page);
    } else if (action === "report-post") {
      const reason = window.prompt("¿Por qué quieres reportar esta publicación? (5–500 caracteres)");
      if (!reason) return;
      await api("/api/reports", json("POST", { postId: Number(id), reason }));
      toastMessage("Gracias. Enviamos el reporte para revisión.");
    } else if (action === "report-user") {
      const reason = window.prompt("¿Por qué quieres reportar este perfil? (5–500 caracteres)");
      if (!reason) return;
      await api("/api/reports", json("POST", { userId: Number(id), reason }));
      toastMessage("Gracias. Enviamos el reporte para revisión.");
    } else if (action === "report-message") {
      const reason = window.prompt("¿Por qué quieres reportar este mensaje? (5–500 caracteres)");
      if (!reason) return;
      await api("/api/reports", json("POST", { messageId: Number(id), reason }));
      toastMessage("Gracias. Enviamos el reporte para revisión.");
    } else if (action === "open-user") {
      await openUser(id);
    } else if (action === "follow") {
      await setFollow(id, true);
    } else if (action === "unfollow" || action === "cancel-follow") {
      await setFollow(id, false);
    } else if (action === "follow-request") {
      await api(`/api/follow-requests/${id}`, json("POST", { action: kind }));
      toastMessage(kind === "accept" ? "Solicitud aceptada." : "Solicitud rechazada.");
      await loadPage(state.page);
    } else if (action === "block-user") {
      if (!window.confirm("¿Quieres bloquear este perfil? No podrá escribirte ni interactuar contigo.")) return;
      await api(`/api/users/${id}/block`, json("POST", {}));
      state.profile = null;
      toastMessage("Perfil bloqueado.");
      await loadPage("discover");
    } else if (action === "start-chat") {
      state.activeChatId = Number(id);
      state.page = "chat";
      state.conversations = (await api("/api/conversations")).conversations;
      state.messages = (await api(`/api/messages/${id}`)).messages;
      renderChat();
    } else if (action === "open-chat") {
      await switchChat(id);
    } else if (action === "chat-back") {
      state.activeChatId = null;
      state.messages = [];
      await loadPage("chat");
    } else if (action === "notifications") {
      await loadPage("notifications");
    } else if (action === "read-notifications") {
      await api("/api/notifications/read", json("POST", {}));
      await loadPage("notifications");
    } else if (action === "remove-track") {
      await api(`/api/collections/${id}/tracks/${encodeURIComponent(track)}`, { method: "DELETE" });
      toastMessage("Canción retirada de la colección.");
      await loadPage("profile");
    } else if (action === "rename-collection") {
      const collection = state.collections.find((item) => item.id === Number(id));
      const name = window.prompt("Nuevo nombre para la colección", collection?.name || "");
      if (name === null) return;
      await api(`/api/collections/${id}`, json("PATCH", { name }));
      toastMessage("Colección actualizada.");
      await loadPage("profile");
    } else if (action === "delete-collection") {
      if (!window.confirm("¿Quieres eliminar esta colección y las canciones guardadas en ella?")) return;
      await api(`/api/collections/${id}`, { method: "DELETE" });
      toastMessage("Colección eliminada.");
      await loadPage("profile");
    } else if (action === "retry") {
      await loadPage(state.page);
    }
  } catch (error) {
    toastMessage(error.message, true);
  }
});

app.addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    if (form.dataset.form === "auth") {
      const errorBox = form.querySelector(".auth-error");
      const isRegister = state.authMode === "register";
      const interests = formData.getAll("interests");
      const result = await api(isRegister ? "/api/auth/register" : "/api/auth/login", json("POST", {
        username: data.username,
        password: data.password,
        ...(isRegister ? { displayName: data.displayName, interests } : {})
      }));
      state.user = result.user;
      state.page = "feed";
      state.profile = { user: state.user };
      startSocket();
      await loadPage("feed");
    } else if (form.dataset.form === "post") {
      await api("/api/posts", json("POST", { body: data.body, trackId: data.trackId || null }));
      toastMessage("Publicación compartida con tu comunidad.");
      await loadPage(state.page);
    } else if (form.dataset.form === "comment") {
      await api(`/api/posts/${form.dataset.id}/comments`, json("POST", { body: data.body }));
      toastMessage("Comentario publicado.");
      await loadPage(state.page);
    } else if (form.dataset.form === "profile") {
      const interests = formData.getAll("interests");
      const updated = await api("/api/me", json("PATCH", {
        displayName: data.displayName,
        bio: data.bio,
        avatarUrl: data.avatarUrl || null,
        interests,
        isPrivate: formData.has("isPrivate"),
        allowDm: formData.has("allowDm")
      }));
      state.user = updated.user;
      toastMessage("Perfil actualizado.");
      await loadPage("profile");
    } else if (form.dataset.form === "search") {
      state.search = data.query.trim();
      state.searchType = data.type;
      await loadPage("discover");
    } else if (form.dataset.form === "collection") {
      await api("/api/collections", json("POST", { name: data.name }));
      toastMessage("Colección creada.");
      await loadPage("profile");
    } else if (form.dataset.form === "add-collection-track") {
      await api(`/api/collections/${form.dataset.id}/tracks`, json("POST", { trackId: data.trackId }));
      toastMessage("Canción agregada a la colección.");
      await loadPage("profile");
    } else if (form.dataset.form === "message") {
      const otherId = Number(form.dataset.id);
      if (state.socket?.connected) {
        const result = await new Promise((resolve, reject) => {
          state.socket.timeout(5000).emit("message:send", { recipientId: otherId, body: data.body, clientMessageId: data.clientMessageId }, (error, response) => {
            if (error) return reject(new Error("No pudimos enviar el mensaje. Revisa tu conexión."));
            if (response?.error) return reject(new Error(response.error));
            resolve(response);
          });
        });
        state.messages.push(result.message);
        updateChatMessages();
        form.reset();
        form.elements.clientMessageId.value = newMessageId();
        state.conversations = (await api("/api/conversations")).conversations;
        loadPage("chat");
      } else {
        const result = await api(`/api/messages/${otherId}`, json("POST", { body: data.body, clientMessageId: data.clientMessageId }));
        state.messages.push(result.message);
        updateChatMessages();
        form.reset();
        form.elements.clientMessageId.value = newMessageId();
        state.conversations = (await api("/api/conversations")).conversations;
        loadPage("chat");
      }
    }
  } catch (error) {
    if (form.dataset.form === "auth") {
      const errorBox = form.querySelector(".auth-error");
      if (errorBox) errorBox.textContent = error.message;
    } else {
      toastMessage(error.message, true);
    }
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
});

app.addEventListener("change", (event) => {
  if (event.target.name === "isPrivate" || event.target.name === "allowDm") return;
  if (event.target.name === "interests") return;
});

app.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches(".sidebar-profile")) loadPage("profile");
});

async function boot() {
  try {
    const session = await api("/api/auth/session");
    if (!session.user) {
      renderAuth();
      return;
    }
    state.user = session.user;
    const catalog = await api("/api/catalog");
    state.catalog = catalog.tracks;
    state.genres = catalog.genres;
    startSocket();
    await loadPage("feed");
  } catch (error) {
    if (state.user) toastMessage(error.message, true);
    if (error.status === 401) {
      renderAuth();
    } else {
      app.innerHTML = `<main class="auth-page"><section class="auth-panel"><div class="auth-form"><div class="brand"><span class="brand-mark">♫</span><span class="brand-name">sonora</span></div><h2>No pudimos conectar.</h2><p>El servidor de Sonora no está disponible en este momento. Tus datos no se han enviado.</p><button class="button" type="button" data-action="retry">Intentar de nuevo</button></div></section></main>`;
    }
  }
}

boot();
