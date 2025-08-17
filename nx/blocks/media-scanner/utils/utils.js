import { crawl } from '../../../public/utils/tree.js';
import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';

// Media extensions (excluding html, json)
const MEDIA_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'mp4', 'pdf'];

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

// Check if file extension is media
function isMediaFile(ext) {
  return MEDIA_EXTENSIONS.includes(ext?.toLowerCase());
}

// Extract relative path by stripping org/repo
function extractRelativePath(fullPath) {
  if (!fullPath) return fullPath;

  const pathParts = fullPath.split('/').filter(Boolean);
  if (pathParts.length >= 2) {
    return `/${pathParts.slice(2).join('/')}`;
  }
  return fullPath;
}

// Extract media path from URL and make it relative
function extractMediaPath(url) {
  try {
    const urlObj = new URL(url);
    return extractRelativePath(urlObj.pathname);
  } catch {
    return extractRelativePath(url); // Return as relative if not a valid URL
  }
}

// Generate CSS selector for an element
function generateSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }

  let selector = element.tagName.toLowerCase();
  if (element.className) {
    const classes = element.className.split(' ').filter((c) => c.trim());
    if (classes.length > 0) {
      selector += `.${classes.join('.')}`;
    }
  }

  // Add nth-child if there are siblings
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children)
      .filter((child) => child.tagName === element.tagName);
    if (siblings.length > 1) {
      const index = siblings.indexOf(element) + 1;
      selector += `:nth-child(${index})`;
    }
  }

  return selector;
}

// Extract surrounding context text
function extractSurroundingContext(element, maxLength = 100) {
  const context = [];

  // Get text from parent elements
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

  // Get text from siblings
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

// HTML parsing
export async function parseHtmlMedia(htmlContent, docPath) {
  const dom = new DOMParser().parseFromString(htmlContent, 'text/html');
  const mediaUsage = [];

  // Parse all img elements (standalone and within picture elements)
  dom.querySelectorAll('img').forEach((img) => {
    if (img.src && isMediaFile(img.src.split('.').pop())) {
      mediaUsage.push({
        mediaPath: extractMediaPath(img.src),
        mediaName: img.src.split('/').pop().split('.')[0],
        docPath: extractRelativePath(docPath),
        alt: img.alt || null,
        type: 'img',
        htmlSelector: generateSelector(img),
        surroundingContext: extractSurroundingContext(img),
      });
    }
  });

  // Parse <video> elements
  dom.querySelectorAll('video').forEach((video) => {
    if (video.src && isMediaFile(video.src.split('.').pop())) {
      mediaUsage.push({
        mediaPath: extractMediaPath(video.src),
        mediaName: video.src.split('/').pop().split('.')[0],
        docPath: extractRelativePath(docPath),
        alt: video.title || null,
        type: 'video',
        htmlSelector: generateSelector(video),
        surroundingContext: extractSurroundingContext(video),
      });
    }

    video.querySelectorAll('source').forEach((source) => {
      if (source.src && isMediaFile(source.src.split('.').pop())) {
        mediaUsage.push({
          mediaPath: extractMediaPath(source.src),
          mediaName: source.src.split('/').pop().split('.')[0],
          docPath: extractRelativePath(docPath),
          alt: video.title || null,
          type: 'video-source',
          htmlSelector: generateSelector(source),
          surroundingContext: extractSurroundingContext(source),
        });
      }
    });
  });

  // Parse media links
  dom.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (href && isMediaFile(href.split('.').pop())) {
      mediaUsage.push({
        mediaPath: extractMediaPath(href),
        mediaName: href.split('/').pop().split('.')[0],
        docPath: extractRelativePath(docPath),
        alt: link.title || null,
        type: 'link',
        htmlSelector: generateSelector(link),
        surroundingContext: extractSurroundingContext(link),
      });
    }
  });

  return mediaUsage;
}

// Storage operations
export async function saveMediaJson(data, org, repo) {
  const path = getMediaJsonPath(org, repo);

  // Add sheet metadata to make it visible as a sheet in DA
  const sheetMeta = {
    total: data.length,
    limit: data.length,
    offset: 0,
    data,
    ':type': 'sheet',
  };

  const blob = new Blob([JSON.stringify(sheetMeta, null, 2)], { type: 'application/json' });
  const formData = new FormData();
  formData.append('data', blob);

  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

export async function loadMediaJson(org, repo) {
  const path = getMediaJsonPath(org, repo);
  const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
  if (!resp.ok) return null;

  const jsonData = await resp.json();

  // Handle both old format (array) and new format (sheet metadata)
  if (Array.isArray(jsonData)) {
    return jsonData;
  }

  // New format with sheet metadata
  if (jsonData && jsonData.data && Array.isArray(jsonData.data)) {
    return jsonData.data;
  }

  return [];
}

// Save JSON with sheet metadata
async function saveToJson(data, filename) {
  const rows = Array.isArray(data) ? data : [data];
  const sheetMeta = {
    total: rows.length,
    limit: rows.length,
    offset: 0,
    data: rows,
    ':type': 'sheet',
  };
  const blob = new Blob([JSON.stringify(sheetMeta, null, 2)], { type: 'application/json' });
  const formData = new FormData();
  formData.append('data', blob);
  const resp = await daFetch(`${DA_ORIGIN}/source${filename}`, { method: 'PUT', body: formData });
  return resp.ok;
}

// Save root.json and folder JSON files
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

export async function createScanLock(org, repo) {
  const path = getScanLockPath(org, repo);
  const lockData = { locked: true, timestamp: Date.now() };
  const blob = new Blob([JSON.stringify(lockData)], { type: 'application/json' });
  const formData = new FormData();
  formData.append('data', blob);

  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

export async function removeScanLock(org, repo) {
  const path = getScanLockPath(org, repo);
  return daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
}

// Main scan function
export default async function runScan(path, updateTotal, org, repo) {
  let pageTotal = 0;
  let mediaTotal = 0;
  const allMediaUsage = [];
  const unusedMedia = [];
  const rootPages = [];
  const folderFiles = {};
  const rootFolders = [];

  // Create scan lock
  await createScanLock(org, repo);

  const callback = async (item) => {
    // Process HTML files for media usage and collect page metadata
    if (item.path.endsWith('.html')) {
      const resp = await daFetch(`${DA_ORIGIN}/source${item.path}`);
      if (resp.ok) {
        pageTotal += 1;
        updateTotal('page', pageTotal);

        const text = await resp.text();
        const mediaUsage = await parseHtmlMedia(text, item.path);
        allMediaUsage.push(...mediaUsage);

        mediaTotal += mediaUsage.length;
        updateTotal('media', mediaTotal);

        // Collect page metadata for root.json and folder JSON files
        const pathParts = item.path.split('/').filter(Boolean);
        const relativePathParts = pathParts.slice(2); // Remove org/repo

        const pageInfo = {
          path: item.path, // Keep full path for metadata files
          lastModified: item.lastModified,
        };

        if (relativePathParts.length === 1) {
          // Root level HTML file
          rootPages.push(pageInfo);
        } else if (relativePathParts.length > 1) {
          // File in a subfolder
          const folderName = relativePathParts[0];
          if (!rootFolders.includes(folderName)) {
            rootFolders.push(folderName);
            folderFiles[folderName] = [];
          }
          folderFiles[folderName].push(pageInfo);
        }
      }
    }

    // Collect unused media files
    if (isMediaFile(item.ext)) {
      unusedMedia.push({
        mediaPath: extractRelativePath(item.path),
        mediaName: item.name,
        docPath: null,
        alt: null,
        type: null,
      });
      mediaTotal += 1;
      updateTotal('media', mediaTotal);
    }
  };

  const { results, getDuration } = crawl({ path, callback });
  await results;

  // Calculate usage count for each media file
  const mediaUsageCount = {};
  allMediaUsage.forEach((usage) => {
    const key = usage.mediaPath;
    mediaUsageCount[key] = (mediaUsageCount[key] || 0) + 1;
  });

  // Add usage count to each media entry
  const mediaDataWithCount = [...allMediaUsage, ...unusedMedia].map((item) => ({
    ...item,
    usageCount: mediaUsageCount[item.mediaPath] || 0,
  }));

  // Save media data
  await saveMediaJson(mediaDataWithCount, org, repo);

  // Save scan metadata (root.json and folder JSON files)
  const saveResults = await saveScanMetadata(org, repo, rootPages, folderFiles);

  if (saveResults.errors.length > 0) {
    console.warn('Some metadata files failed to save:', saveResults.errors);
  }

  // Remove scan lock
  await removeScanLock(org, repo);

  const duration = getDuration();
  return duration;
}
