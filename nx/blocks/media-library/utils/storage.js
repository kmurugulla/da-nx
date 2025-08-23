// nx/blocks/media-library/utils/storage.js

import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';

export function getMediaLibraryPath(org, repo) {
  return `/${org}/${repo}/.da/media`;
}

export function getMediaJsonPath(org, repo) {
  return `${getMediaLibraryPath(org, repo)}/media.json`;
}

export function getScanLockPath(org, repo) {
  return `${getMediaLibraryPath(org, repo)}/scan-lock.json`;
}

export function getScanMetadataPath(org, repo) {
  return `${getMediaLibraryPath(org, repo)}/pages`;
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

export async function saveMediaJson(data, org, repo) {
  const path = getMediaJsonPath(org, repo);
  const formData = await createJsonBlob(data);
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

export async function loadMediaJson(org, repo) {
  const path = getMediaJsonPath(org, repo);
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (resp.ok) {
      const data = await resp.json();
      return data.data || data || [];
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error loading media.json:', error);
  }
  return [];
}

async function saveToJson(data, filename) {
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const formData = new FormData();
  formData.append('data', blob);
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
