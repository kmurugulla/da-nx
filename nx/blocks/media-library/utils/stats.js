// nx/blocks/media-library/utils/stats.js

import { getMediaType, isSvgFile, getSubtype } from './types.js';

export function getMediaCounts(mediaData) {
  if (!mediaData) return {};

  const uniqueMedia = new Set();
  const uniqueImages = new Set();
  const uniqueVideos = new Set();
  const uniqueDocuments = new Set();
  const uniqueLinks = new Set();
  const uniqueIcons = new Set();
  const uniqueUsed = new Set();
  const uniqueUnused = new Set();
  const uniqueMissingAlt = new Set();

  mediaData.forEach((media) => {
    const mediaUrl = media.url || '';
    uniqueMedia.add(mediaUrl);

    const mediaType = getMediaType(media);
    const isSvg = isSvgFile(media);

    if (isSvg) {
      uniqueIcons.add(mediaUrl);
    } else if (mediaType === 'image') {
      uniqueImages.add(mediaUrl);
    } else if (mediaType === 'video') {
      uniqueVideos.add(mediaUrl);
    } else if (mediaType === 'document') {
      uniqueDocuments.add(mediaUrl);
    } else if (mediaType === 'link') {
      uniqueLinks.add(mediaUrl);
    }

    if (media.doc && media.doc.trim()) {
      uniqueUsed.add(mediaUrl);
    } else {
      uniqueUnused.add(mediaUrl);
    }

    if (!media.alt && media.type && media.type.startsWith('img >') && !isSvg) {
      uniqueMissingAlt.add(mediaUrl);
    }
  });

  return {
    total: uniqueMedia.size,
    images: uniqueImages.size,
    videos: uniqueVideos.size,
    documents: uniqueDocuments.size,
    links: uniqueLinks.size,
    icons: uniqueIcons.size,
    used: uniqueUsed.size,
    unused: uniqueUnused.size,
    missingAlt: uniqueMissingAlt.size,
  };
}

export function getDocumentMediaBreakdown(mediaData, documentPath) {
  if (!mediaData || !documentPath) return null;

  const documentMedia = mediaData.filter((media) => media.doc === documentPath);
  const breakdown = getMediaCounts(documentMedia);

  return {
    ...breakdown,
    total: documentMedia.length,
  };
}

export function getAvailableSubtypes(mediaData, activeFilter = 'links') {
  if (!mediaData || activeFilter !== 'links') return [];

  const subtypes = new Map();

  mediaData.forEach((media) => {
    const type = media.type || '';
    if (type.includes(' > ')) {
      const baseType = type.split(' > ')[0];
      if (activeFilter === 'links' && baseType === 'link') {
        const subtype = getSubtype(media);
        if (subtype) {
          const normalizedSubtype = subtype.toUpperCase().trim();
          const mediaUrl = media.url || '';

          if (!subtypes.has(normalizedSubtype)) {
            subtypes.set(normalizedSubtype, new Set());
          }
          subtypes.get(normalizedSubtype).add(mediaUrl);
        }
      }
    }
  });

  return Array.from(subtypes.entries())
    .map(([subtype, uniqueUrls]) => ({ subtype, count: uniqueUrls.size }))
    .sort((a, b) => a.subtype.localeCompare(b.subtype));
}

export function aggregateMediaData(mediaData) {
  if (!mediaData) return [];

  const aggregatedMedia = new Map();
  mediaData.forEach((item) => {
    const mediaUrl = item.url;
    if (!aggregatedMedia.has(mediaUrl)) {
      aggregatedMedia.set(mediaUrl, {
        ...item,
        mediaUrl,
        usageCount: 0,
        isUsed: false,
      });
    }
    const aggregated = aggregatedMedia.get(mediaUrl);

    // Only increment usage count if there's a valid document path
    if (item.doc && item.doc.trim()) {
      aggregated.usageCount += 1;
      aggregated.isUsed = true;
    }
  });

  return Array.from(aggregatedMedia.values());
}
