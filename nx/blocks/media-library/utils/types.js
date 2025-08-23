// nx/blocks/media-library/utils/types.js

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'];
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi'];
export const DOCUMENT_EXTENSIONS = ['pdf'];
export const AUDIO_EXTENSIONS = ['mp3', 'wav'];
export const MEDIA_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
];

function extractFileExtension(filePath) {
  return filePath?.split('.').pop()?.toLowerCase();
}

function isSvgFile(media) {
  const type = media.type || '';
  return type === 'img > svg' || type === 'link > svg';
}

export function detectMediaTypeFromExtension(ext) {
  if (IMAGE_EXTENSIONS.includes(ext)) return 'img';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (DOCUMENT_EXTENSIONS.includes(ext)) return 'document';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  return 'unknown';
}

export function getMediaType(media) {
  const type = media.type || '';
  if (type.startsWith('img >')) return 'image';
  if (type.startsWith('video >')) return 'video';
  if (type.startsWith('document >')) return 'document';
  if (type.startsWith('link >')) return 'link';

  const mediaUrl = media.url || media.mediaUrl || '';
  const ext = extractFileExtension(mediaUrl);
  return detectMediaTypeFromExtension(ext);
}

export function getSubtype(media) {
  const type = media.type || '';
  if (!type.includes(' > ')) return '';

  const [, subtype] = type.split(' > ');
  return subtype.toUpperCase();
}

export function getDisplayMediaType(media) {
  if (media.type) {
    if (media.type.includes(' > ')) {
      const [baseType, subtype] = media.type.split(' > ');
      const baseLabels = {
        img: 'IMAGE',
        video: 'VIDEO',
        'video-source': 'VIDEO SOURCE',
        link: 'LINK',
        background: 'BACKGROUND',
      };
      const baseLabel = baseLabels[baseType] || baseType.toUpperCase();
      return `${baseLabel} (${subtype.toUpperCase()})`;
    }

    const typeLabels = {
      img: 'IMAGE',
      video: 'VIDEO',
      'video-source': 'VIDEO SOURCE',
      link: 'LINK',
      background: 'BACKGROUND',
    };
    return typeLabels[media.type] || media.type.toUpperCase();
  }

  const mediaUrl = media.url || media.mediaUrl || '';
  const ext = extractFileExtension(mediaUrl);
  if (IMAGE_EXTENSIONS.includes(ext)) return 'IMAGE';
  if (ext === 'mp4') return 'VIDEO';
  if (ext === 'pdf') return 'DOCUMENT';
  return 'UNKNOWN';
}

export function isMediaFile(ext) {
  let cleanExt = ext;
  if (cleanExt && cleanExt.startsWith('.')) {
    cleanExt = cleanExt.substring(1);
  }
  const lowerExt = cleanExt?.toLowerCase();
  return MEDIA_EXTENSIONS.includes(lowerExt);
}

export { isSvgFile, extractFileExtension };
