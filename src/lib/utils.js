export const generateRoomCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

// Every browser tab gets a stable id for the session (survives refresh via
// sessionStorage, but not shared across tabs). Used for presence, host
// transfer targeting, and "is this my own message" checks.
export const getClientId = () => {
  let id = sessionStorage.getItem('wp_client_id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('wp_client_id', id);
  }
  return id;
};

// Google Drive "view" links are webpage wrappers, not playable media files.
// This converts them into a direct-streaming link react-player can use.
// Works best for files under ~100MB due to Drive's bandwidth caps.
export const parseMediaUrl = (url) => {
  const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
  }
  return url;
};

// Fetches title/thumbnail/author for a video URL using the free noembed.com
// oEmbed proxy. Covers YouTube, Vimeo, Dailymotion, SoundCloud and more.
// Fails silently (returns null) so the UI can fall back to the raw URL.
export async function fetchOEmbed(url) {
  if (!url) return null;
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return { title: data.title, thumbnail: data.thumbnail_url, author: data.author_name };
  } catch {
    return null;
  }
}
