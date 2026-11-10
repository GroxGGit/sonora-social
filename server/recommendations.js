import { CATALOG, GENRES } from "./catalog.js";

const ACTION_WEIGHT = {
  like: 5,
  save: 4,
  listened: 2,
  dislike: -8
};

function parseInterests(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((genre) => GENRES.includes(genre)) : [];
  } catch {
    return [];
  }
}

export function scoreRecommendations(db, userId, limit = 12) {
  const user = db.prepare("SELECT interests FROM users WHERE id = ?").get(userId);
  if (!user) return [];

  const interests = parseInterests(user.interests);
  const genreScores = new Map(interests.map((genre) => [genre, 3]));
  const ownFeedback = db.prepare("SELECT track_id, action FROM feedback WHERE user_id = ?").all(userId);

  for (const item of ownFeedback) {
    const track = CATALOG.find(({ id }) => id === item.track_id);
    if (!track) continue;
    genreScores.set(track.genre, (genreScores.get(track.genre) ?? 0) + (ACTION_WEIGHT[item.action] ?? 0));
  }

  const socialLikes = db.prepare(`
    SELECT f.track_id, u.display_name
    FROM feedback f
    JOIN follows fl ON fl.followed_id = f.user_id
    JOIN users u ON u.id = f.user_id
    LEFT JOIN blocks b1 ON b1.blocker_id = ? AND b1.blocked_id = f.user_id
    LEFT JOIN blocks b2 ON b2.blocker_id = f.user_id AND b2.blocked_id = ?
    WHERE fl.follower_id = ? AND f.action IN ('like', 'save') AND b1.blocker_id IS NULL AND b2.blocker_id IS NULL
    ORDER BY f.updated_at DESC
    LIMIT 30
  `).all(userId, userId, userId);

  const socialTracks = new Map();
  for (const item of socialLikes) {
    const track = CATALOG.find(({ id }) => id === item.track_id);
    if (!track) continue;
    const existing = socialTracks.get(track.id);
    if (!existing) socialTracks.set(track.id, { count: 1, person: item.display_name });
    else existing.count += 1;
    genreScores.set(track.genre, (genreScores.get(track.genre) ?? 0) + 1);
  }

  const feedbackByTrack = new Map(ownFeedback.map(({ track_id, action }) => [track_id, action]));
  return CATALOG
    .filter((track) => !["dislike", "listened"].includes(feedbackByTrack.get(track.id)))
    .map((track) => {
      const score = genreScores.get(track.genre) ?? 0;
      const social = socialTracks.get(track.id);
      let reason;
      if (social) reason = `${social.person} y otras personas que sigues guardaron esta canción`;
      else if (feedbackByTrack.get(track.id) === "like" || feedbackByTrack.get(track.id) === "save") reason = "La guardaste o te gustó antes";
      else if (interests.includes(track.genre)) reason = `Elegiste el género ${track.genre}`;
      else if (score > 0) reason = `Basada en tus interacciones con ${track.genre}`;
      else reason = "Una propuesta para ampliar tu descubrimiento musical";
      return { ...track, score, reason };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function similarityPercent(firstInterests, secondInterests) {
  const first = parseInterests(firstInterests);
  const second = parseInterests(secondInterests);
  if (!first.length && !second.length) return 0;
  const matches = first.filter((genre) => second.includes(genre)).length;
  const combined = new Set([...first, ...second]).size;
  return Math.round((matches / Math.max(combined, 1)) * 100);
}
