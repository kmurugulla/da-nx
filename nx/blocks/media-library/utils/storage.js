// nx/blocks/media-library/utils/storage.js

import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { getMediaJsonPath } from './paths.js';

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
      const result = data.data || data || [];
      return result;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error loading media.json:', error);
  }
  return [];
}
