// nx/blocks/media-library/utils/scanning.js

import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { getScanLockPath, saveMediaJson, loadMediaJson } from './storage.js';
import { crawl } from '../../../public/utils/tree.js';
import { parseHtmlMedia } from './parsing.js';
import { isMediaFile, extractFileExtension, detectMediaTypeFromExtension } from './types.js';
import { createHash, groupUsagesByPath } from './utils.js';

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

  const existingMediaMap = new Map();
  existingMediaData.forEach((item) => {
    existingMediaMap.set(item.mediaUrl, item);
  });

  // Build map of document timestamps from existing media data
  const previousDocTimestamps = new Map();
  const groupedUsages = groupUsagesByPath(existingMediaData);

  groupedUsages.forEach((group) => {
    // Find the most recent lastUsedAt timestamp for this document
    const latestTimestamp = group.usages.reduce((latest, usage) => {
      if (usage.lastUsedAt) {
        const timestamp = new Date(usage.lastUsedAt).getTime();
        return Math.max(latest, timestamp);
      }
      return latest;
    }, 0);

    if (latestTimestamp > 0) {
      previousDocTimestamps.set(group.path, latestTimestamp);
    }
  });

  const mediaInUse = new Set();

  function processMediaUsage(newUsage, existingData, docLastModified) {
    const existingEntry = existingData.find(
      (entry) => entry.doc === newUsage.doc && entry.url === newUsage.url,
    );

    if (!existingEntry) {
      // New usage - timestamps already set in createMediaUsage
      return;
    }

    // Existing usage - check if changed using hash
    if (existingEntry.hash === newUsage.hash) {
      // No change - just update lastUsedAt if document changed
      newUsage.firstUsedAt = existingEntry.firstUsedAt;
      newUsage.lastUsedAt = docLastModified || new Date().toISOString();
    } else {
      // Usage changed - update timestamps
      newUsage.firstUsedAt = existingEntry.firstUsedAt;
      newUsage.lastUsedAt = docLastModified || new Date().toISOString();
    }
  }

  const callback = async (item) => {
    if (item.path.endsWith('.html')) {
      totalPagesScanned += 1;
      updateTotal('page', totalPagesScanned, pageTotal);

      // Check if document has been modified since last scan
      const docPreviousTimestamp = previousDocTimestamps.get(item.path);
      const isDocModified = !docPreviousTimestamp
        || item.lastModified > docPreviousTimestamp;

      if (isDocModified) {
        // Only scan modified HTML files
        const resp = await daFetch(`${DA_ORIGIN}/source${item.path}`);
        if (resp.ok) {
          pageTotal += 1;
          updateTotal('page', totalPagesScanned, pageTotal);

          const text = await resp.text();
          const docLastModified = new Date(item.lastModified).toISOString();
          const mediaUsage = await parseHtmlMedia(text, item.path, org, repo, docLastModified);

          // Process each usage with hash comparison
          mediaUsage.forEach((usage) => {
            processMediaUsage(usage, existingMediaData, docLastModified);
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

      // Always process media files since we don't track previous timestamps
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
        // NEW FIELDS
        hash: createHash(mediaUrl),
        firstUsedAt: new Date(item.lastModified).toISOString(),
        lastUsedAt: new Date(item.lastModified).toISOString(),
      });
      mediaTotal += 1;
      updateTotal('media', totalMediaScanned, mediaTotal);
    }
  };

  const { results, getDuration } = crawl({ path, callback });
  await results;

  const allMediaEntries = [];
  const processedUrls = new Set();

  // First, add all existing entries that are still valid
  existingMediaData.forEach((item) => {
    if (mediaInUse.has(item.url) || !item.doc) {
      allMediaEntries.push(item);
      processedUrls.add(item.url);
    }
  });

  // Then, replace/add new usage entries
  allMediaUsage.forEach((usage) => {
    // Remove existing entry if it exists
    const existingIndex = allMediaEntries.findIndex((entry) => entry.url === usage.url);
    if (existingIndex !== -1) {
      allMediaEntries.splice(existingIndex, 1);
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
    }
  });

  const mediaDataWithCount = allMediaEntries
    .filter((item) => item.url && item.name);

  const hasActualChanges = pageTotal > 0 || mediaTotal > 0;

  if (hasActualChanges) {
    await saveMediaJson(mediaDataWithCount, org, repo);
  }

  await removeScanLock(org, repo);

  const duration = getDuration();
  return { duration: `${duration}s`, hasChanges: hasActualChanges };
}
