import { crawl } from '../../../public/utils/tree.js';
import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';

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

// Path utilities
function getMediaLibraryPath(org, repo) {
  return `/${org}/${repo}/.media`;
}

function getMediaJsonPath(org, repo) {
  return `${getMediaLibraryPath(org, repo)}/media.json`;
}

function getScanLockPath(org, repo) {
  return `${getMediaLibraryPath(org, repo)}/scan-lock.json`;
}

function getScanMetadataPath(org, repo) {
  return `${getMediaLibraryPath(org, repo)}/pages`;
}

function extractRelativePath(fullPath) {
  if (!fullPath) return fullPath;

  const pathParts = fullPath.split('/').filter(Boolean);
  if (pathParts.length >= 2) {
    return `/${pathParts.slice(2).join('/')}`;
  }
  return fullPath;
}

function resolveMediaUrl(src, docPath, org, repo) {
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

function generateSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }

  const path = [];
  let current = element;

  while (current && current !== document.body && current.parentElement) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = `#${current.id}`;
      path.unshift(selector);
      break;
    }

    if (current.className) {
      const classes = current.className.split(' ').filter((c) => c.trim());
      if (classes.length > 0) {
        selector += `.${classes.join('.')}`;
      }
    }

    const parent = current.parentElement;
    if (parent) {
      const currentTagName = current.tagName;
      const siblings = Array.from(parent.children)
        .filter((child) => child.tagName === currentTagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  const maxDepth = 5;
  const finalPath = path.slice(-maxDepth);

  return finalPath.join(' > ');
}

function extractSurroundingContext(element, maxLength = 100) {
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

// Internal helper functions
function extractFileExtension(filePath) {
  return filePath?.split('.').pop()?.toLowerCase();
}

function detectMediaTypeFromExtension(ext) {
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (DOCUMENT_EXTENSIONS.includes(ext)) return 'document';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  return 'unknown';
}

function splitPathParts(fullPath) {
  const pathParts = fullPath.split('/').filter(Boolean);
  const relativePathParts = pathParts.slice(2);
  return { pathParts, relativePathParts };
}

function createMediaUsage(resolvedUrl, src, docPath, type, element, alt = null) {
  return {
    url: resolvedUrl,
    name: src.split('/').pop().split('.')[0],
    doc: extractRelativePath(docPath),
    alt,
    type,
    selector: generateSelector(element),
    ctx: extractSurroundingContext(element),
  };
}

async function createJsonBlob(data, type = 'sheet') {
  const sheetMeta = {
    total: data.length,
    limit: data.length,
    offset: 0,
    data,
    ':type': type,
  };
  const blob = new Blob([JSON.stringify(sheetMeta, null, 2)], { type: 'application/json' });
  const formData = new FormData();
  formData.append('data', blob);
  return formData;
}

function isMediaFile(ext) {
  let cleanExt = ext;
  if (cleanExt && cleanExt.startsWith('.')) {
    cleanExt = cleanExt.substring(1);
  }
  const lowerExt = cleanExt?.toLowerCase();
  return MEDIA_EXTENSIONS.includes(lowerExt);
}

// Media type utilities
export function getMediaType(media) {
  const type = media.type || '';
  if (type.startsWith('img >')) return 'image';
  if (type.startsWith('video >')) return 'video';
  if (type.startsWith('document >')) return 'document';

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

export function getMediaCounts(mediaData) {
  if (!mediaData) return {};

  const uniqueMedia = new Set();
  const uniqueImages = new Set();
  const uniqueVideos = new Set();
  const uniqueDocuments = new Set();
  const uniqueUsed = new Set();
  const uniqueUnused = new Set();
  const uniqueMissingAlt = new Set();

  mediaData.forEach((media) => {
    const mediaUrl = media.url || media.mediaUrl || '';
    uniqueMedia.add(mediaUrl);

    const mediaType = getMediaType(media);

    if (mediaType === 'image') {
      uniqueImages.add(mediaUrl);
    } else if (mediaType === 'video') {
      uniqueVideos.add(mediaUrl);
    } else {
      uniqueDocuments.add(mediaUrl);
    }

    if (media.doc && media.doc.trim()) {
      uniqueUsed.add(mediaUrl);
    } else {
      uniqueUnused.add(mediaUrl);
    }

    if (!media.alt && media.type && media.type.startsWith('img >')) {
      uniqueMissingAlt.add(mediaUrl);
    }
  });

  return {
    total: uniqueMedia.size,
    images: uniqueImages.size,
    videos: uniqueVideos.size,
    documents: uniqueDocuments.size,
    used: uniqueUsed.size,
    unused: uniqueUnused.size,
    missingAlt: uniqueMissingAlt.size,
  };
}

export function getAvailableSubtypes(mediaData, activeFilter = 'images') {
  if (!mediaData || activeFilter !== 'images') return [];

  const subtypes = new Map();

  mediaData.forEach((media) => {
    const type = media.type || '';
    if (type.includes(' > ') && (type.startsWith('img >') || type.startsWith('link >'))) {
      const subtype = getSubtype(media);
      if (subtype) {
        const normalizedSubtype = subtype.toUpperCase().trim();
        const mediaUrl = media.url || media.mediaUrl || '';

        if (!subtypes.has(normalizedSubtype)) {
          subtypes.set(normalizedSubtype, new Set());
        }
        subtypes.get(normalizedSubtype).add(mediaUrl);
      }
    }
  });

  return Array.from(subtypes.entries())
    .map(([subtype, uniqueUrls]) => ({ subtype, count: uniqueUrls.size }))
    .sort((a, b) => a.subtype.localeCompare(b.subtype));
}

export async function parseHtmlMedia(htmlContent, docPath, org, repo) {
  const dom = new DOMParser().parseFromString(htmlContent, 'text/html');
  const mediaUsage = [];

  dom.querySelectorAll('img').forEach((img) => {
    if (img.src && isMediaFile(extractFileExtension(img.src))) {
      const resolvedUrl = resolveMediaUrl(img.src, docPath, org, repo);
      const fileExt = extractFileExtension(img.src);
      mediaUsage.push(createMediaUsage(resolvedUrl, img.src, docPath, `img > ${fileExt}`, img, img.alt || null));
    }
  });

  dom.querySelectorAll('video').forEach((video) => {
    if (video.src && isMediaFile(extractFileExtension(video.src))) {
      const resolvedUrl = resolveMediaUrl(video.src, docPath, org, repo);
      const fileExt = extractFileExtension(video.src);
      mediaUsage.push(createMediaUsage(resolvedUrl, video.src, docPath, `video > ${fileExt}`, video, null));
    }

    video.querySelectorAll('source').forEach((source) => {
      if (source.src && isMediaFile(extractFileExtension(source.src))) {
        const resolvedUrl = resolveMediaUrl(source.src, docPath, org, repo);
        const fileExt = extractFileExtension(source.src);
        mediaUsage.push(createMediaUsage(resolvedUrl, source.src, docPath, `video-source > ${fileExt}`, source, null));
      }
    });
  });

  dom.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (href && isMediaFile(extractFileExtension(href))) {
      const resolvedUrl = resolveMediaUrl(href, docPath, org, repo);
      const fileExt = extractFileExtension(href);
      mediaUsage.push(createMediaUsage(resolvedUrl, href, docPath, `link > ${fileExt}`, link, null));
    }
  });

  return mediaUsage;
}

export async function saveMediaJson(data, org, repo) {
  const path = getMediaJsonPath(org, repo);
  const formData = await createJsonBlob(data);
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

let lastMediaJsonModified = null;

async function checkMediaJsonModified(org, repo) {
  try {
    const mediaFolderPath = `/${org}/${repo}/.media`;
    const resp = await daFetch(`${DA_ORIGIN}/source${mediaFolderPath}`);

    if (!resp.ok) return true;

    const folderData = await resp.json();
    const mediaJsonPath = getMediaJsonPath(org, repo);
    const mediaJsonEntry = folderData.find((item) => item.path === mediaJsonPath);

    if (!mediaJsonEntry) return true;

    const currentModified = mediaJsonEntry.lastModified;
    return currentModified !== lastMediaJsonModified;
  } catch (error) {
    console.warn('Failed to check media.json modification:', error);
    return true;
  }
}

export async function loadMediaJson(org, repo) {
  const path = getMediaJsonPath(org, repo);

  if (lastMediaJsonModified) {
    const modified = await checkMediaJsonModified(org, repo);
    if (!modified) {
      return null;
    }
  }

  const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
  if (!resp.ok) return null;

  const jsonData = await resp.json();
  lastMediaJsonModified = new Date().toISOString();

  if (Array.isArray(jsonData)) {
    return jsonData;
  }

  if (jsonData && jsonData.data && Array.isArray(jsonData.data)) {
    return jsonData.data;
  }

  return [];
}

async function saveToJson(data, filename) {
  const rows = Array.isArray(data) ? data : [data];
  const formData = await createJsonBlob(rows);
  const resp = await daFetch(`${DA_ORIGIN}/source${filename}`, { method: 'PUT', body: formData });
  return resp.ok;
}

export async function saveScanMetadata(org, repo, rootData, folderData = {}) {
  const scanPath = getScanMetadataPath(org, repo);
  const results = {
    root: null,
    folders: {},
    errors: [],
  };

  try {
    const rootFilename = `${scanPath}/root.json`;
    const rootSuccess = await saveToJson(rootData, rootFilename);
    results.root = { filename: rootFilename, success: rootSuccess };

    if (!rootSuccess) {
      results.errors.push('Failed to save root.json');
    }
  } catch (error) {
    results.errors.push(`Error saving root.json: ${error.message}`);
  }

  const folderPromises = Object.entries(folderData).map(async ([folderName, data]) => {
    try {
      const folderFilename = `${scanPath}/${folderName}.json`;
      const success = await saveToJson(data, folderFilename);
      results.folders[folderName] = { filename: folderFilename, success };

      if (!success) {
        results.errors.push(`Failed to save ${folderName}.json`);
      }

      return { folderName, success };
    } catch (error) {
      results.errors.push(`Error saving ${folderName}.json: ${error.message}`);
      return { folderName, success: false, error: error.message };
    }
  });

  await Promise.all(folderPromises);

  return results;
}

export async function checkScanLock(org, repo) {
  const path = getScanLockPath(org, repo);
  try {
    const response = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (response.ok) {
      const lockData = await response.json();
      return {
        exists: true,
        timestamp: lockData.data?.[0]?.timestamp || lockData.timestamp,
        locked: lockData.data?.[0]?.locked || lockData.locked,
      };
    }
    return { exists: false };
  } catch (error) {
    return { exists: false };
  }
}

export async function createScanLock(org, repo) {
  const path = getScanLockPath(org, repo);
  const lockData = { locked: true, timestamp: Date.now() };
  const formData = await createJsonBlob([lockData], 'lock');
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

export async function removeScanLock(org, repo) {
  const path = getScanLockPath(org, repo);
  return daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
}

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
    const { origin, pathname: path } = url;
    let modifiedOrigin = origin;

    if (url.hostname.includes('scene7.com')) {
      modifiedOrigin += ' (DM)';
    } else if (url.hostname.includes('.da.live')) {
      modifiedOrigin += ' (DA)';
    } else if (url.hostname.includes('.aem.page') || url.hostname.includes('.aem.live')
               || url.hostname.includes('.hlx.page') || url.hostname.includes('.hlx.live')) {
      modifiedOrigin += ' (Media Bus)';
    } else if (url.pathname.includes('/content/dam')) {
      modifiedOrigin += ' (AEM)';
    }

    return { origin: modifiedOrigin, path };
  } catch (error) {
    return { origin: 'Unknown', path: 'Unknown' };
  }
}

export function groupUsagesByPath(usages) {
  const grouped = {};
  usages.forEach((usage) => {
    const docPath = usage.doc || 'Unknown Document';
    if (!grouped[docPath]) {
      grouped[docPath] = [];
    }
    grouped[docPath].push(usage);
  });
  return grouped;
}

export function getEditUrl(org, repo, docPath) {
  if (!docPath || !org || !repo) return null;
  return `https://da.live/edit#/${org}/${repo}${docPath}`;
}

export function getViewUrl(org, repo, docPath) {
  if (!docPath || !org || !repo) return null;
  const cleanPath = docPath.replace(/\.html$/, '');
  return `https://main--${repo}--${org}.aem.page${cleanPath}`;
}

export async function updateDocumentAltText(org, repo, docPath, htmlSelector, altText) {
  const response = await daFetch(`${DA_ORIGIN}/source/${org}/${repo}${docPath}`);
  if (!response.ok) {
    throw new Error('Failed to fetch document');
  }

  const htmlContent = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  const imgElement = doc.querySelector(htmlSelector);
  if (!imgElement) {
    throw new Error('Image element not found in document');
  }

  imgElement.setAttribute('alt', altText);
  const mainContent = doc.querySelector('main')?.innerHTML || doc.body.innerHTML;
  const blob = new Blob([mainContent], { type: 'text/html' });
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

export const EXIF_JS_URL = 'https://cdn.jsdelivr.net/npm/exif-js';

export async function loadScanMetadata(org, repo) {
  const scanPath = getScanMetadataPath(org, repo);
  const metadata = {
    root: [],
    folders: {},
    errors: [],
  };

  try {
    const rootResp = await daFetch(`${DA_ORIGIN}/source${scanPath}/root.json`);
    if (rootResp.ok) {
      const rootData = await rootResp.json();
      metadata.root = rootData.data || rootData || [];
    }
  } catch (error) {
    metadata.errors.push(`Error loading root.json: ${error.message}`);
  }

  try {
    const foldersResp = await daFetch(`${DA_ORIGIN}/list${scanPath}`);
    if (foldersResp.ok) {
      const files = await foldersResp.json();
      const folderFiles = files.filter((file) => file.ext === 'json' && file.name !== 'root');

      for (const file of folderFiles) {
        try {
          const folderResp = await daFetch(`${DA_ORIGIN}/source${file.path}`);
          if (folderResp.ok) {
            const folderData = await folderResp.json();
            const folderName = file.name.replace('.json', '');
            metadata.folders[folderName] = folderData.data || folderData || [];
          }
        } catch (error) {
          metadata.errors.push(`Error loading ${file.name}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    metadata.errors.push(`Error listing folder files: ${error.message}`);
  }

  return metadata;
}

export default async function runScan(path, updateTotal, org, repo) {
  let pageTotal = 0;
  let mediaTotal = 0;
  let totalPagesScanned = 0;
  let totalMediaScanned = 0;
  const allMediaUsage = [];
  const unusedMedia = [];
  const rootPages = [];
  const folderFiles = {};
  const rootFolders = [];

  // Check if a scan is already running
  const existingLock = await checkScanLock(org, repo);
  if (existingLock.exists && existingLock.locked) {
    const lockAge = Date.now() - existingLock.timestamp;
    const maxLockAge = 30 * 60 * 1000; // 30 minutes

    if (lockAge < maxLockAge) {
      throw new Error(`Scan already in progress. Lock created ${Math.round(lockAge / 1000 / 60)} minutes ago.`);
    } else {
      // Lock is stale, remove it and continue
      await removeScanLock(org, repo);
    }
  }

  await createScanLock(org, repo);

  const existingMediaData = await loadMediaJson(org, repo) || [];
  const previousMetadata = await loadScanMetadata(org, repo);

  const existingMediaMap = new Map();
  existingMediaData.forEach((item) => {
    existingMediaMap.set(item.mediaUrl, item);
  });

  const previousTimestamps = new Map();
  if (previousMetadata.root) {
    previousMetadata.root.forEach((file) => {
      previousTimestamps.set(file.path, file.lastModified);
    });
  }
  Object.values(previousMetadata.folders || {}).forEach((folderFileList) => {
    folderFileList.forEach((file) => {
      previousTimestamps.set(file.path, file.lastModified);
    });
  });

  const mediaInUse = new Set();

  const callback = async (item) => {
    const previousLastModified = previousTimestamps.get(item.path);
    const isModified = !previousLastModified || previousLastModified !== item.lastModified;

    if (item.path.endsWith('.html')) {
      totalPagesScanned += 1;
      updateTotal('page', totalPagesScanned, pageTotal);

      if (isModified) {
        const resp = await daFetch(`${DA_ORIGIN}/source${item.path}`);
        if (resp.ok) {
          pageTotal += 1;
          updateTotal('page', totalPagesScanned, pageTotal);

          const text = await resp.text();
          const mediaUsage = await parseHtmlMedia(text, item.path, org, repo);

          mediaUsage.forEach((usage) => {
            mediaInUse.add(usage.url);
          });

          allMediaUsage.push(...mediaUsage);

          mediaTotal += mediaUsage.length;
          updateTotal('media', totalMediaScanned, mediaTotal);
        }
      } else {
        const relativePath = extractRelativePath(item.path);
        const existingEntries = existingMediaData.filter((entry) => entry.doc === relativePath);
        existingEntries.forEach((entry) => {
          mediaInUse.add(entry.url);
        });
      }

      const { relativePathParts } = splitPathParts(item.path);

      const pageInfo = {
        path: item.path,
        lastModified: item.lastModified,
      };

      if (relativePathParts.length === 1) {
        rootPages.push(pageInfo);
      } else if (relativePathParts.length > 1) {
        const folderName = relativePathParts[0];
        if (!rootFolders.includes(folderName)) {
          rootFolders.push(folderName);
          folderFiles[folderName] = [];
        }
        folderFiles[folderName].push(pageInfo);
      }
    }

    if (isMediaFile(item.ext)) {
      totalMediaScanned += 1;
      updateTotal('media', totalMediaScanned, mediaTotal);

      const mediaPreviousLastModified = previousTimestamps.get(item.path);
      const isMediaModified = !mediaPreviousLastModified
        || mediaPreviousLastModified !== item.lastModified;

      if (isMediaModified) {
        const mediaUrl = `${CONTENT_ORIGIN}${item.path}`;
        const fileExt = extractFileExtension(item.ext);
        const mediaType = detectMediaTypeFromExtension(fileExt);
        const type = `${mediaType} > ${fileExt}`;

        unusedMedia.push({
          url: mediaUrl,
          name: item.name,
          doc: '',
          alt: '',
          type,
          selector: '',
          ctx: '',
        });
        mediaTotal += 1;
        updateTotal('media', totalMediaScanned, mediaTotal);
      }

      const { relativePathParts } = splitPathParts(item.path);

      const mediaInfo = {
        path: item.path,
        lastModified: item.lastModified,
      };

      if (relativePathParts.length === 1) {
        rootPages.push(mediaInfo);
      } else if (relativePathParts.length > 1) {
        const folderName = relativePathParts[0];
        if (!rootFolders.includes(folderName)) {
          rootFolders.push(folderName);
          folderFiles[folderName] = [];
        }
        folderFiles[folderName].push(mediaInfo);
      }
    }
  };

  const { results, getDuration } = crawl({ path, callback });
  await results;

  const allMediaEntries = [];

  existingMediaData.forEach((item) => {
    if (mediaInUse.has(item.url) || !item.doc) {
      allMediaEntries.push(item);
    }
  });

  allMediaUsage.forEach((usage) => {
    allMediaEntries.push(usage);
  });

  unusedMedia.forEach((item) => {
    allMediaEntries.push({
      ...item,
      doc: item.doc || '',
      alt: item.alt || '',
      type: item.type || '',
      selector: item.selector || '',
      ctx: item.ctx || '',
    });
  });

  const mediaDataWithCount = allMediaEntries
    .filter((item) => item.url && item.name);

  const hasActualChanges = pageTotal > 0 || mediaTotal > 0;

  if (hasActualChanges) {
    await saveMediaJson(mediaDataWithCount, org, repo);
    const saveResults = await saveScanMetadata(org, repo, rootPages, folderFiles);

    if (saveResults.errors.length > 0) {
      // Some metadata files failed to save
    }
  }

  await removeScanLock(org, repo);

  const duration = getDuration();
  return { duration: `${duration}s`, hasChanges: hasActualChanges };
}

export async function copyImageToClipboard(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();

  // Convert image to PNG if it's not a supported format
  let clipboardBlob = blob;
  let mimeType = blob.type;

  if (!['image/png', 'image/gif', 'image/webp'].includes(blob.type)) {
    // Convert JPEG and other formats to PNG for clipboard compatibility
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
    aggregated.usageCount += 1;
    if (item.doc && item.doc.trim()) {
      aggregated.isUsed = true;
    }
  });

  return Array.from(aggregatedMedia.values());
}
