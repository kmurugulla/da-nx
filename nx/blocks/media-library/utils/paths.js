// nx/blocks/media-library/utils/paths.js

/**
 * Centralized path configuration for media-library module
 * All paths should be generated through these functions to avoid hardcoding
 */

export function getMediaLibraryPath(org, repo) {
  return `/${org}/${repo}/.da/mediaindex`;
}

export function getMediaJsonPath(org, repo) {
  return `${getMediaLibraryPath(org, repo)}/media.json`;
}

export function getScanLockPath(org, repo) {
  return `${getMediaLibraryPath(org, repo)}/scan-lock.json`;
}

export function getLastModifiedDataPath(org, repo, folderName = 'root') {
  return `${getMediaLibraryPath(org, repo)}/lastmodified-data/${folderName}.json`;
}
