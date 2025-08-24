// nx/blocks/media-library/utils/parsing.js

import { isMediaFile, extractFileExtension } from './types.js';
import { createHash } from './utils.js';

const DA_CONTENT_ENVS = {
  local: 'http://localhost:8788',
  stage: 'https://stage-content.da.live',
  prod: 'https://content.da.live',
};

function getContentEnv(location, key, envs) {
  const { href } = location;
  const query = new URL(href).searchParams.get(key);
  if (query && query === 'reset') {
    localStorage.removeItem(key);
  } else if (query) {
    localStorage.setItem(key, query);
  }
  const env = envs[localStorage.getItem(key) || 'prod'];
  return location.origin === 'https://da.page' ? env.replace('.live', '.page') : env;
}

const CONTENT_ORIGIN = (() => getContentEnv(window.location, 'da-content', DA_CONTENT_ENVS))();

export function extractRelativePath(fullPath) {
  if (!fullPath) return fullPath;

  const pathParts = fullPath.split('/').filter(Boolean);
  if (pathParts.length >= 2) {
    return `/${pathParts.slice(2).join('/')}`;
  }
  return fullPath;
}

export function splitPathParts(fullPath) {
  const pathParts = fullPath.split('/').filter(Boolean);
  const relativePathParts = pathParts.slice(2);
  return { pathParts, relativePathParts };
}

export function resolveMediaUrl(src, docPath, org, repo) {
  try {
    const url = new URL(src);
    return url.href;
  } catch {
    let resolvedPath = src;

    if (src.startsWith('/')) {
      resolvedPath = `${CONTENT_ORIGIN}/${org}/${repo}${src}`;
    } else if (src.startsWith('./')) {
      const docDir = docPath.substring(0, docPath.lastIndexOf('/') + 1);
      resolvedPath = `${CONTENT_ORIGIN}/${org}/${repo}${docDir}${src.substring(2)}`;
    } else if (src.startsWith('../')) {
      const docDir = docPath.substring(0, docPath.lastIndexOf('/'));
      const parentDir = docDir.substring(0, docDir.lastIndexOf('/') + 1);
      resolvedPath = `${CONTENT_ORIGIN}/${org}/${repo}${parentDir}${src.substring(3)}`;
    } else {
      const docDir = docPath.substring(0, docPath.lastIndexOf('/') + 1);
      resolvedPath = `${CONTENT_ORIGIN}/${org}/${repo}${docDir}${src}`;
    }

    return resolvedPath;
  }
}

export function extractSurroundingContext(element, maxLength = 100) {
  const context = [];

  let parent = element.parentElement;
  let depth = 0;
  while (parent && depth < 3) {
    const text = parent.textContent?.trim();
    if (text && text.length > 10) {
      context.push(text.substring(0, maxLength));
    }
    parent = parent.parentElement;
    depth += 1;
  }

  const siblings = Array.from(element.parentElement?.children || []);
  siblings.forEach((sibling) => {
    if (sibling !== element && sibling.textContent) {
      const text = sibling.textContent.trim();
      if (text && text.length > 5) {
        context.push(text.substring(0, maxLength));
      }
    }
  });

  return context.slice(0, 3).join(' ').substring(0, maxLength);
}

export function createMediaUsage(
  resolvedUrl,
  src,
  docPath,
  type,
  element,
  alt = null,
  docLastModified = null,
) {
  const timestamp = docLastModified || new Date().toISOString();
  const docPathRelative = extractRelativePath(docPath);
  const usageHash = createHash(resolvedUrl + docPathRelative + (alt || ''));

  return {
    url: resolvedUrl,
    name: src.split('/').pop(), // Use full filename including extension
    doc: docPathRelative,
    alt,
    type,
    ctx: extractSurroundingContext(element),
    // NEW FIELDS
    hash: usageHash,
    firstUsedAt: timestamp,
    lastUsedAt: timestamp,
  };
}

export async function parseHtmlMedia(htmlContent, docPath, org, repo, docLastModified = null) {
  const dom = new DOMParser().parseFromString(htmlContent, 'text/html');
  const mediaUsage = [];

  dom.querySelectorAll('img').forEach((img) => {
    if (img.src && isMediaFile(extractFileExtension(img.src))) {
      const resolvedUrl = resolveMediaUrl(img.src, docPath, org, repo);
      const fileExt = extractFileExtension(img.src);
      mediaUsage.push(createMediaUsage(resolvedUrl, img.src, docPath, `img > ${fileExt}`, img, img.alt || null, docLastModified));
    }
  });

  dom.querySelectorAll('video').forEach((video) => {
    if (video.src && isMediaFile(extractFileExtension(video.src))) {
      const resolvedUrl = resolveMediaUrl(video.src, docPath, org, repo);
      const fileExt = extractFileExtension(video.src);
      mediaUsage.push(createMediaUsage(resolvedUrl, video.src, docPath, `video > ${fileExt}`, video, null, docLastModified));
    }

    video.querySelectorAll('source').forEach((source) => {
      if (source.src && isMediaFile(extractFileExtension(source.src))) {
        const resolvedUrl = resolveMediaUrl(source.src, docPath, org, repo);
        const fileExt = extractFileExtension(source.src);
        mediaUsage.push(createMediaUsage(resolvedUrl, source.src, docPath, `video-source > ${fileExt}`, source, null, docLastModified));
      }
    });
  });

  dom.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (href && isMediaFile(extractFileExtension(href))) {
      const resolvedUrl = resolveMediaUrl(href, docPath, org, repo);
      const fileExt = extractFileExtension(href);
      mediaUsage.push(createMediaUsage(resolvedUrl, href, docPath, `link > ${fileExt}`, link, null, docLastModified));
    }
  });

  return mediaUsage;
}
