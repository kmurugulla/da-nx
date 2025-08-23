// nx/blocks/media-library/utils/utils.js

import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';

import { getMediaType } from './types.js';

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / (k ** i)).toFixed(2))} ${sizes[i]}`;
}

export function extractMediaLocation(mediaUrl) {
  try {
    const url = new URL(mediaUrl);
    return {
      origin: url.origin,
      path: url.pathname,
      fullUrl: mediaUrl,
    };
  } catch (error) {
    // If it's not a valid URL, treat it as a relative path
    return {
      origin: '',
      path: mediaUrl,
      fullUrl: mediaUrl,
    };
  }
}

export function normalizeUrl(url) {
  if (!url) return '';

  // Remove protocol and domain to get just the path
  try {
    const urlObj = new URL(url);
    return urlObj.pathname;
  } catch {
    // If it's not a valid URL, return as is (might be a relative path)
    return url;
  }
}

export function urlsMatch(url1, url2) {
  if (!url1 || !url2) return false;

  // Normalize both URLs to just their paths
  const path1 = normalizeUrl(url1);
  const path2 = normalizeUrl(url2);

  // Direct match
  if (path1 === path2) return true;

  // Handle cases where one might have leading slash and other doesn't
  const normalizedPath1 = path1.startsWith('/') ? path1 : `/${path1}`;
  const normalizedPath2 = path2.startsWith('/') ? path2 : `/${path2}`;

  if (normalizedPath1 === normalizedPath2) return true;

  // Handle relative paths by comparing file names
  const fileName1 = path1.split('/').pop();
  const fileName2 = path2.split('/').pop();

  return fileName1 === fileName2 && fileName1 && fileName2;
}

export function groupUsagesByPath(usages) {
  const grouped = new Map();

  usages.forEach((usage) => {
    const docPath = usage.doc || 'Unknown Document';
    if (!grouped.has(docPath)) {
      grouped.set(docPath, []);
    }
    grouped.get(docPath).push(usage);
  });

  return Array.from(grouped.entries()).map(([path, usageList]) => ({
    path,
    usages: usageList,
    count: usageList.length,
  }));
}

export function getEditUrl(org, repo, docPath) {
  return `https://da.page/${org}/${repo}${docPath}`;
}

export function getViewUrl(org, repo, docPath) {
  return `https://main--${repo}--${org}.aem.page${docPath}`;
}

export function createElement(tag, attributes = {}, content = undefined) {
  const element = document.createElement(tag);

  if (attributes) {
    Object.entries(attributes).forEach(([key, val]) => {
      switch (key) {
        case 'className':
          element.className = val;
          break;
        case 'dataset':
          Object.assign(element.dataset, val);
          break;
        case 'textContent':
          element.textContent = val;
          break;
        case 'innerHTML':
          element.innerHTML = val;
          break;
        case 'style':
          if (typeof val === 'object') {
            Object.assign(element.style, val);
          } else {
            element.style.cssText = val;
          }
          break;
        case 'events':
          Object.entries(val).forEach(([event, handler]) => {
            element.addEventListener(event, handler);
          });
          break;
        default:
          element.setAttribute(key, val);
      }
    });
  }

  if (content) {
    if (Array.isArray(content)) {
      element.append(...content);
    } else if (content instanceof HTMLElement || content instanceof SVGElement) {
      element.append(content);
    } else {
      element.insertAdjacentHTML('beforeend', content);
    }
  }

  return element;
}

export async function copyMediaToClipboard(media) {
  const mediaUrl = media.url || media.mediaUrl;
  const mediaType = getMediaType(media);

  let clipboardContent = '';

  if (mediaType === 'image') {
    const imageName = media.name || 'Image';
    clipboardContent = `<img src="${mediaUrl}" alt="${media.alt || ''}" title="${imageName}">`;
  } else if (mediaType === 'video') {
    clipboardContent = `<a href="${mediaUrl}" title="${media.name || 'Video'}">${media.name || 'Video'}</a>`;
  } else if (mediaType === 'document') {
    clipboardContent = `<a href="${mediaUrl}" title="${media.name || 'Document'}">${media.name || 'Document'}</a>`;
  } else {
    clipboardContent = `<a href="${mediaUrl}" title="${media.name || 'Media'}">${media.name || 'Media'}</a>`;
  }

  try {
    await navigator.clipboard.writeText(clipboardContent);
    return { heading: 'Copied', message: 'Media link copied to clipboard.' };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to copy to clipboard:', error);
    return { heading: 'Error', message: 'Failed to copy to clipboard.' };
  }
}

export async function copyImageToClipboard(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();

  let clipboardBlob = blob;
  let mimeType = blob.type;

  if (!['image/png', 'image/gif', 'image/webp'].includes(blob.type)) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    clipboardBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    mimeType = 'image/png';

    URL.revokeObjectURL(img.src);
  }

  const clipboardItem = new ClipboardItem({ [mimeType]: clipboardBlob });
  await navigator.clipboard.write([clipboardItem]);
}

export async function updateDocumentAltText(org, repo, docPath, mediaUrl, altText) {
  const response = await daFetch(`${DA_ORIGIN}/source/${org}/${repo}${docPath}`);
  if (!response.ok) {
    throw new Error('Failed to fetch document');
  }

  const htmlContent = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // Find all img elements with matching src that don't have alt text
  const imgElements = doc.querySelectorAll('img');
  let updated = false;

  imgElements.forEach((img) => {
    const imgSrc = img.getAttribute('src');
    if (imgSrc && !img.getAttribute('alt')) {
      // Use lenient URL matching
      if (urlsMatch(imgSrc, mediaUrl)) {
        img.setAttribute('alt', altText);
        updated = true;
      }
    }
  });

  if (!updated) {
    throw new Error('No matching image elements without alt text found in document');
  }

  // Save the entire document, not just the main content
  const fullDocumentContent = doc.documentElement.outerHTML;
  const blob = new Blob([fullDocumentContent], { type: 'text/html' });
  const formData = new FormData();
  formData.append('data', blob);

  const saveResponse = await daFetch(`${DA_ORIGIN}/source/${org}/${repo}${docPath}`, {
    method: 'PUT',
    body: formData,
  });

  if (!saveResponse.ok) {
    throw new Error('Failed to save document');
  }
}
