export const generateRoomCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

export const getClientId = () => {
  let id = sessionStorage.getItem('wp_client_id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('wp_client_id', id);
  }
  return id;
};

export const parseMediaUrl = (url) => {
  const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
  }
  return url;
};

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