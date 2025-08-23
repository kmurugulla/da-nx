// nx/blocks/media-library/utils/scanning.js

import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { getScanLockPath, saveMediaJson, saveScanMetadata, loadMediaJson, loadScanMetadata } from './storage.js';
import { crawl } from '../../../public/utils/tree.js';
import { parseHtmlMedia, extractRelativePath, splitPathParts } from './parsing.js';
import { isMediaFile, extractFileExtension, detectMediaTypeFromExtension } from './types.js';

let lastMediaJsonModified = null;

export async function checkMediaJsonModified(org, repo) {
  try {
    const mediaFolderPath = `/${org}/${repo}/.da/media`;
    const mediaJsonPath = `/${org}/${repo}/.da/media/media.json`;

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
    lastMediaJsonModified = lastModified;

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
  const rootPages = [];
  const folderFiles = {};
  const rootFolders = [];

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
      // eslint-disable-next-line no-console
      console.warn('Some scan metadata files failed to save:', saveResults.errors);
    }
  }

  await removeScanLock(org, repo);

  const duration = getDuration();
  return { duration: `${duration}s`, hasChanges: hasActualChanges };
}
