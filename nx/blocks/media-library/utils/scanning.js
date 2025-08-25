// nx/blocks/media-library/utils/scanning.js

import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { saveMediaJson, loadMediaJson } from './storage.js';
import { getScanLockPath, getLastModifiedDataPath, getMediaJsonPath, getMediaLibraryPath } from './paths.js';
import { crawl } from '../../../public/utils/tree.js';
import { parseHtmlMedia } from './parsing.js';
import { isMediaFile, extractFileExtension, detectMediaTypeFromExtension } from './types.js';
import { createHash } from './utils.js';

// LastModified tracking functions
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

async function getLastModifiedPath(org, repo, folderName = 'root') {
  return getLastModifiedDataPath(org, repo, folderName);
}

async function loadLastModifiedData(org, repo, folderName = 'root') {
  const path = await getLastModifiedPath(org, repo, folderName);
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (resp.ok) {
      const data = await resp.json();
      return data.data || data || [];
    }
  } catch (error) {
    // File doesn't exist or other error
  }
  return [];
}

async function saveLastModifiedData(org, repo, folderName, data) {
  const path = await getLastModifiedPath(org, repo, folderName);
  const formData = await createJsonBlob(data);
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

function splitPathParts(fullPath) {
  const pathParts = fullPath.split('/').filter(Boolean);
  const relativePathParts = pathParts.slice(2); // Remove /da-pilot/docket/
  return { pathParts, relativePathParts };
}

function groupFilesByFolder(crawlItems) {
  const rootFiles = [];
  const folderFiles = {};

  crawlItems.forEach((item) => {
    // Extract extension from path
    const ext = item.path.split('.').pop().toLowerCase();

    // Only include HTML and media files
    if (ext === 'html' || isMediaFile(ext)) {
      const fileInfo = {
        path: item.path,
        lastModified: item.lastModified,
      };

      const { relativePathParts } = splitPathParts(item.path);

      if (relativePathParts.length === 1) {
        // Root level file
        rootFiles.push(fileInfo);
      } else if (relativePathParts.length > 1) {
        // Folder file
        const folderName = relativePathParts[0];
        if (!folderFiles[folderName]) {
          folderFiles[folderName] = [];
        }
        folderFiles[folderName].push(fileInfo);
      }
    }
  });

  return { rootFiles, folderFiles };
}

function getLastMediaJsonModifiedKey(org, repo) {
  return `${org}-${repo}-media-lastupdated`;
}

function getLastMediaJsonModified(org, repo) {
  const key = getLastMediaJsonModifiedKey(org, repo);
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : null;
}

function setLastMediaJsonModified(org, repo, timestamp) {
  const key = getLastMediaJsonModifiedKey(org, repo);
  localStorage.setItem(key, timestamp.toString());
}

export async function checkMediaJsonModified(org, repo) {
  try {
    const mediaFolderPath = getMediaLibraryPath(org, repo);
    const mediaJsonPath = getMediaJsonPath(org, repo);

    const lastMediaJsonModified = getLastMediaJsonModified(org, repo);

    let mediaJsonEntry = null;

    const callback = async (item) => {
      if (item.path === mediaJsonPath) {
        mediaJsonEntry = item;
      }
    };

    const { results } = crawl({ path: mediaFolderPath, callback });
    await results;

    if (!mediaJsonEntry) {
      return { hasChanged: true, fileTimestamp: null };
    }

    const { lastModified } = mediaJsonEntry;
    const hasChanged = !lastMediaJsonModified || lastModified > lastMediaJsonModified;

    setLastMediaJsonModified(org, repo, lastModified);

    return { hasChanged, fileTimestamp: lastModified };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error checking media.json modification:', error);
    return { hasChanged: true, fileTimestamp: null };
  }
}

export async function createScanLock(org, repo) {
  const path = getScanLockPath(org, repo);
  const lockData = {
    timestamp: Date.now(),
    locked: true,
  };
  const content = JSON.stringify(lockData, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const formData = new FormData();
  formData.append('data', blob);
  return daFetch(`${DA_ORIGIN}/source${path}`, { method: 'PUT', body: formData });
}

export async function checkScanLock(org, repo) {
  const path = getScanLockPath(org, repo);
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (resp.ok) {
      const data = await resp.json();
      return { exists: true, locked: data.locked, timestamp: data.timestamp };
    }
  } catch (error) {
    // File doesn't exist or other error
  }
  return { exists: false, locked: false, timestamp: null };
}

export async function removeScanLock(org, repo) {
  const path = getScanLockPath(org, repo);
  return daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
}

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

export default async function runScan(path, updateTotal, org, repo) {
  let pageTotal = 0;
  let mediaTotal = 0;
  let totalPagesScanned = 0;
  let totalMediaScanned = 0;
  const allMediaUsage = [];
  const unusedMedia = [];
  const allCrawlItems = []; // Collect all crawl items for lastModified tracking

  const existingLock = await checkScanLock(org, repo);
  if (existingLock.exists && existingLock.locked) {
    const lockAge = Date.now() - existingLock.timestamp;
    const maxLockAge = 30 * 60 * 1000;

    if (lockAge < maxLockAge) {
      throw new Error(`Scan already in progress. Lock created ${Math.round(lockAge / 1000 / 60)} minutes ago.`);
    } else {
      await removeScanLock(org, repo);
    }
  }

  await createScanLock(org, repo);

  const existingMediaData = await loadMediaJson(org, repo) || [];

  // Load existing lastModified data for change detection
  const lastModifiedMap = new Map();

  // Load root files
  try {
    const rootData = await loadLastModifiedData(org, repo, 'root');
    rootData.forEach((item) => {
      lastModifiedMap.set(item.path, item.lastModified);
    });
  } catch (error) {
    // Root file doesn't exist yet, that's okay
  }

  // Load folder files - we need to discover what folders exist
  // For now, let's try common folder names, or we could scan the directory
  const commonFolders = ['media', 'fragments', 'drafts', 'authors', 'developers', 'administrators', 'about', 'ja', 'fr', 'es', 'de', 'cn'];

  for (const folderName of commonFolders) {
    try {
      const folderData = await loadLastModifiedData(org, repo, folderName);
      folderData.forEach((item) => {
        lastModifiedMap.set(item.path, item.lastModified);
      });
    } catch (error) {
      // Folder file doesn't exist yet, that's okay
    }
  }

  const mediaInUse = new Set();

  const callback = async (item) => {
    // Collect all HTML and media files for lastModified tracking
    if (item.ext === 'html' || isMediaFile(item.ext)) {
      allCrawlItems.push({
        path: item.path,
        lastModified: item.lastModified,
      });
    }

    if (item.path.endsWith('.html')) {
      totalPagesScanned += 1;
      updateTotal('page', totalPagesScanned, pageTotal);

      // Check if document has been modified since last scan
      const previousTimestamp = lastModifiedMap.get(item.path);
      const shouldScan = !previousTimestamp || item.lastModified > previousTimestamp;

      if (shouldScan) {
        // Only scan modified HTML files
        const resp = await daFetch(`${DA_ORIGIN}/source${item.path}`);
        if (resp.ok) {
          pageTotal += 1;
          updateTotal('page', totalPagesScanned, pageTotal);

          const text = await resp.text();
          const docLastModified = new Date(item.lastModified).toISOString();
          const mediaUsage = await parseHtmlMedia(text, item.path, org, repo, docLastModified);

          // Process each usage
          mediaUsage.forEach((usage) => {
            mediaInUse.add(usage.url);
          });

          allMediaUsage.push(...mediaUsage);
          mediaTotal += mediaUsage.length;
          updateTotal('media', totalMediaScanned, mediaTotal);
        }
      }
    }

    if (isMediaFile(item.ext)) {
      totalMediaScanned += 1;
      updateTotal('media', totalMediaScanned, mediaTotal);

      // Check if this media file already exists in our data
      const mediaUrl = `${CONTENT_ORIGIN}${item.path}`;
      const existingMediaEntry = existingMediaData.find((entry) => entry.url === mediaUrl);

      if (existingMediaEntry) {
        // Media file already exists - check if it has changed
        const fileExt = extractFileExtension(item.ext);
        const mediaType = detectMediaTypeFromExtension(fileExt);
        const type = `${mediaType} > ${fileExt}`;
        const newHash = createHash(mediaUrl);

        // Only add to unused media if hash is different (file changed)
        if (existingMediaEntry.hash !== newHash) {
          unusedMedia.push({
            url: mediaUrl,
            name: item.name,
            doc: '',
            alt: '',
            type,
            ctx: '',
            hash: newHash,
            firstUsedAt: existingMediaEntry.firstUsedAt,
            lastUsedAt: new Date(item.lastModified).toISOString(),
          });
          mediaTotal += 1;
        }
      } else {
        // New media file
        const fileExt = extractFileExtension(item.ext);
        const mediaType = detectMediaTypeFromExtension(fileExt);
        const type = `${mediaType} > ${fileExt}`;

        unusedMedia.push({
          url: mediaUrl,
          name: item.name,
          doc: '',
          alt: '',
          type,
          ctx: '',
          hash: createHash(mediaUrl),
          firstUsedAt: new Date(item.lastModified).toISOString(),
          lastUsedAt: new Date(item.lastModified).toISOString(),
        });
        mediaTotal += 1;
      }
      updateTotal('media', totalMediaScanned, mediaTotal);
    }
  };

  const { results, getDuration } = crawl({ path, callback });
  await results;

  const allMediaEntries = [];
  const processedUrls = new Set();
  let hasActualChanges = false;

  // First, preserve ALL existing entries - be very conservative
  existingMediaData.forEach((item) => {
    allMediaEntries.push(item);
    processedUrls.add(item.url);
  });

  // Then, replace/add new usage entries
  allMediaUsage.forEach((usage) => {
    // Remove existing entry if it exists
    const existingIndex = allMediaEntries.findIndex((entry) => entry.url === usage.url);
    if (existingIndex !== -1) {
      const existingEntry = allMediaEntries[existingIndex];

      // Only mark as changed if alt text actually changed
      // Ignore document path changes to prevent oscillation
      const altChanged = existingEntry.alt !== usage.alt;

      // Only consider it a change if alt text changed
      // Document path changes are ignored to prevent oscillation
      const significantChange = altChanged;

      if (significantChange) {
        hasActualChanges = true;
      }
      allMediaEntries.splice(existingIndex, 1);
    } else {
      // New entry - this is a change
      hasActualChanges = true;
    }
    allMediaEntries.push(usage);
    processedUrls.add(usage.url);
  });

  // Finally, add unused media that aren't already processed
  unusedMedia.forEach((item) => {
    if (!processedUrls.has(item.url)) {
      allMediaEntries.push({
        ...item,
        doc: item.doc || '',
        alt: item.alt || '',
        type: item.type || '',
        ctx: item.ctx || '',
      });
      // New unused media - this is a change
      hasActualChanges = true;
    }
  });

  const mediaDataWithCount = allMediaEntries
    .filter((item) => item.url && item.name);

  if (hasActualChanges) {
    await saveMediaJson(mediaDataWithCount, org, repo);
  }

  // Save lastModified data for next scan - only if changed
  const { rootFiles, folderFiles } = groupFilesByFolder(allCrawlItems);

  // Check if root files changed
  const rootChanged = rootFiles.some((file) => {
    const existing = lastModifiedMap.get(file.path);
    return !existing || existing !== file.lastModified;
  });

  // Check if any folder files changed
  const folderChanged = Object.entries(folderFiles).some(([, files]) => files.some((file) => {
    const existing = lastModifiedMap.get(file.path);
    return !existing || existing !== file.lastModified;
  }));

  // Only save root files if changed
  if (rootChanged) {
    try {
      await saveLastModifiedData(org, repo, 'root', rootFiles);
    } catch (error) {
      console.error('Error saving root.json:', error);
    }
  }

  // Only save folder files if changed
  if (folderChanged) {
    for (const [folderName, files] of Object.entries(folderFiles)) {
      try {
        await saveLastModifiedData(org, repo, folderName, files);
      } catch (error) {
        console.error(`Error saving ${folderName}.json:`, error);
      }
    }
  }

  await removeScanLock(org, repo);

  const duration = getDuration();
  return { duration: `${duration}s`, hasChanges: hasActualChanges };
}
