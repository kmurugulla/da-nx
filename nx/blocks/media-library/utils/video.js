// nx/blocks/media-library/utils/video.js

export function getVideoThumbnail(videoUrl) {
  if (!videoUrl) return null;

  const youtubeMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  if (youtubeMatch) {
    return `https://img.youtube.com/vi/${youtubeMatch[1]}/maxresdefault.jpg`;
  }

  const vimeoMatch = videoUrl.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    const videoId = vimeoMatch[1];
    return `https://i.vimeocdn.com/video/${videoId}_640.jpg`;
  }

  const dailymotionMatch = videoUrl.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([^&\n?#]+)/);
  if (dailymotionMatch) {
    const videoId = dailymotionMatch[1];
    return `https://www.dailymotion.com/thumbnail/video/${videoId}`;
  }

  const dynamicMediaMatch = videoUrl.match(/(scene7\.com\/is\/content\/[^?]+)/);
  if (dynamicMediaMatch) {
    return `${dynamicMediaMatch[1]}?fmt=jpeg&wid=300&hei=200`;
  }

  const marketingMatch = videoUrl.match(/(marketing\.adobe\.com\/is\/content\/[^?]+)/);
  if (marketingMatch) {
    return `${marketingMatch[1]}?fmt=jpeg&wid=300&hei=200`;
  }

  return null;
}

export function isVideoUrl(url) {
  if (!url) return false;

  const supportedPatterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)/,
    /vimeo\.com\/(\d+)/,
    /(?:dailymotion\.com\/video\/|dai\.ly\/)/,
    /scene7\.com\/is\/content\//,
    /marketing\.adobe\.com\/is\/content\//,
  ];

  return supportedPatterns.some((pattern) => pattern.test(url));
}

export const EXIF_JS_URL = 'https://cdn.jsdelivr.net/npm/exif-js';
