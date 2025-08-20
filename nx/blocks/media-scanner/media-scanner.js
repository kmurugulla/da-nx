import { html, LitElement } from 'da-lit';
import getStyle from '../../utils/styles.js';
import getSvg from '../../public/utils/svg.js';
import runScan, {
  loadMediaJson,
  copyImageToClipboard,
  getMediaCounts,
  aggregateMediaData,
  getMediaType,
} from './utils/utils.js';
import '../../public/sl/components.js';

// Import view components
import './views/topbar/topbar.js';
import './views/sidebar/sidebar.js';
import './views/grid/grid.js';
import './views/folder/folder.js';
import './views/list/list.js';
import './views/mediainfo/mediainfo.js';

const EL_NAME = 'nx-media-scanner';

// Styles
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const styles = await getStyle(import.meta.url);

const ICONS = [
  `${nx}/public/icons/S2_Icon_Close_20_N.svg`,
];

class NxMediaScanner extends LitElement {
  static properties = {
    sitePath: { attribute: false },
    _error: { state: true },
    _sitePathError: { state: true },
    _pageTotal: { state: true },
    _mediaTotal: { state: true },
    _duration: { state: true },
    _hasChanges: { state: true },
    _mediaData: { state: true },
    _filters: { state: true },
    _searchQuery: { state: true },
    _isScanning: { state: true },
    _currentView: { state: true },
    _scanProgress: { state: true },
    _hierarchyDialogOpen: { state: true },
    _infoModalOpen: { state: true },
    _selectedMedia: { state: true },
    _activeFilter: { state: true },
    _selectedSubtypes: { state: true },
    _folderFilterPaths: { state: true },
    _message: { state: true },
  };

  constructor() {
    super();
    this._currentView = 'grid';
    this._scanProgress = { pages: 0, media: 0 };
    this._hierarchyDialogOpen = false;
    this._infoModalOpen = false;
    this._selectedMedia = null;
    this._activeFilter = 'all';
    this._selectedSubtypes = [];
    this._folderFilterPaths = [];
    this._hasChanges = null;
    this._message = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];

    getSvg({ parent: this.shadowRoot, paths: ICONS });

    // Start polling for media updates
    this.startPolling();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Stop polling when component is removed
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
    }
    if (this._scanPollingInterval) {
      clearInterval(this._scanPollingInterval);
    }
  }

  startPolling() {
    // Poll every 30 seconds for media updates
    this._pollingInterval = setInterval(async () => {
      if (this.sitePath && !this._isScanning) {
        const [org, repo] = this.sitePath.split('/').slice(1, 3);
        await this.loadMediaData(org, repo);
      }
    }, 30000); // 30 seconds

    this._scanPollingInterval = setInterval(async () => {
      if (this.sitePath && !this._isScanning) {
        const [org, repo] = this.sitePath.split('/').slice(1, 3);
        await this.startPollingBackgroundScan(org, repo);
      }
    }, 120000);
  }

  update(props) {
    if (props.has('sitePath') && this.sitePath) this.scan();
    super.update();
  }

  async scan() {
    const [org, repo] = this.sitePath.split('/').slice(1, 3);

    // Load existing media data immediately
    await this.loadMediaData(org, repo);

    // Start background scan (non-blocking)
    this.startBackgroundScan(org, repo);
  }

  async startBackgroundScan(org, repo) {
    this._isScanning = true;

    const updateTotal = async (type, totalScanned, processedCount) => {
      if (type === 'page') {
        this._pageTotal = processedCount;
        this._scanProgress = { ...this._scanProgress, pages: totalScanned };
        this.requestUpdate();
      }
      if (type === 'media') {
        this._mediaTotal = processedCount;
        this._scanProgress = { ...this._scanProgress, media: totalScanned };
        this.requestUpdate();
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    };

    try {
      const result = await runScan(this.sitePath, updateTotal, org, repo);
      this._duration = result.duration;
      this._hasChanges = result.hasChanges;

      await this.loadMediaData(org, repo);
    } catch (error) {
      if (error.message && error.message.includes('Scan already in progress')) {
        console.warn('Scan lock detected:', error.message);
      } else {
        console.error('Scan failed:', error);
      }
    } finally {
      this._isScanning = false;
    }
  }

  async startPollingBackgroundScan(org, repo) {
    try {
      this._isScanning = true;
      await runScan(org, repo);
      await this.loadMediaData(org, repo);
    } catch (error) {
      console.error('Background scan failed:', error);
    } finally {
      this._isScanning = false;
    }
  }

  async loadMediaData(org, repo) {
    try {
      const mediaData = await loadMediaJson(org, repo);
      if (mediaData) {
        this._mediaData = mediaData;
        this.updateFilters();
      }
    } catch (error) {
      console.error('Failed to load media data:', error);
    }
  }

  updateFilters() {
    if (!this._mediaData) return;
    const aggregatedData = aggregateMediaData(this._mediaData);
    this._filters = getMediaCounts(aggregatedData);
  }

  get org() {
    if (!this.sitePath) return '';
    const pathParts = this.sitePath.split('/').filter(Boolean);
    return pathParts[0] || '';
  }

  get repo() {
    if (!this.sitePath) return '';
    const pathParts = this.sitePath.split('/').filter(Boolean);
    return pathParts[1] || '';
  }

  render() {
    return html`
      <div class="media-library">
        <nx-media-topbar
          .searchQuery=${this._searchQuery}
          .currentView=${this._currentView}
          ._isScanning=${this._isScanning}
          ._scanProgress=${this._scanProgress}
          ._duration=${this._duration}
          ._hasChanges=${this._hasChanges}
          .folderFilterPaths=${this._folderFilterPaths}
          @search=${this.handleSearch}
          @viewChange=${this.handleViewChange}
          @openFolderDialog=${this.handleOpenFolderDialog}
          @clearFolderFilter=${this.handleClearFolderFilter}
        ></nx-media-topbar>
        
        <nx-media-sidebar
          .mediaData=${this._mediaData}
          ._activeFilter=${this._activeFilter}
          @filter=${this.handleFilter}
          @subtypeFilter=${this.handleSubtypeFilter}
        ></nx-media-sidebar>
        
        <div class="media-content">
          ${this.renderCurrentView()}
        </div>
        
        <nx-media-folder-dialog
          .mediaData=${this._mediaData}
          .isOpen=${this._hierarchyDialogOpen}
          @close=${this.handleFolderDialogClose}
          @apply=${this.handleFolderFilterApply}
          @filterChange=${this.handleFolderFilterChange}
        ></nx-media-folder-dialog>

        <nx-media-info
          .media=${this._selectedMedia}
          .org=${this.org}
          .repo=${this.repo}
          .allMediaData=${this._mediaData}
          .isOpen=${this._infoModalOpen}
          @close=${this.handleInfoModalClose}
          @altTextUpdated=${this.handleAltTextUpdated}
        ></nx-media-info>

        ${this._message ? html`
          <div class="nx-media-toast is-visible">
            <div class="nx-media-toast-content">
              <p class="nx-media-toast-heading">${this._message.heading}</p>
              <p class="nx-media-toast-message">${this._message.message}</p>
            </div>
            <button class="nx-media-toast-close" @click=${this.handleToastClose}>
              <svg viewBox="0 0 20 20">
                <use href="#S2_Icon_Close_20_N"></use>
              </svg>
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderCurrentView() {
    switch (this._currentView) {
      case 'list':
        return html`
          <nx-media-list
            .mediaData=${this.filteredMediaData}
            .isScanning=${this._isScanning}
            @mediaClick=${this.handleMediaClick}
            @mediaInfo=${this.handleMediaInfo}
            @mediaUsage=${this.handleMediaUsage}
          ></nx-media-list>
        `;
      case 'grid':
      default:
        return html`
          <nx-media-grid
            .mediaData=${this.filteredMediaData}
            .isScanning=${this._isScanning}
            @mediaClick=${this.handleMediaClick}
            @mediaInfo=${this.handleMediaInfo}
            @mediaUsage=${this.handleMediaUsage}
          ></nx-media-grid>
        `;
    }
  }

  handleSearch(e) {
    this._searchQuery = e.detail.query;
  }

  handleViewChange(e) {
    this._currentView = e.detail.view;
  }

  handleFilter(e) {
    this._activeFilter = e.detail.type;
    if (e.detail.type !== 'missingAlt') {
      this._selectedSubtypes = [];
    }
  }

  handleSubtypeFilter(e) {
    this._selectedSubtypes = e.detail.subtypes;
  }

  get filteredMediaData() {
    if (!this._mediaData) return [];

    let filtered = aggregateMediaData(this._mediaData);

    // Apply active filter
    switch (this._activeFilter) {
      case 'images':
        filtered = filtered.filter((item) => getMediaType(item) === 'image');
        break;
      case 'videos':
        filtered = filtered.filter((item) => getMediaType(item) === 'video');
        break;
      case 'documents':
        filtered = filtered.filter((item) => getMediaType(item) === 'document');
        break;
      case 'used':
        filtered = filtered.filter((item) => item.isUsed);
        break;
      case 'unused':
        filtered = filtered.filter((item) => !item.isUsed);
        break;
      case 'missingAlt':
        // Only show images that are missing alt text, but don't reset other filters
        filtered = filtered.filter((item) => getMediaType(item) === 'image' && !item.alt && item.type && item.type.startsWith('img >'));
        break;
      case 'all':
      default:
        // No filtering needed
        break;
    }

    // Apply subtype filtering
    if (this._selectedSubtypes.length > 0) {
      filtered = filtered.filter((item) => {
        const itemType = item.type || '';

        if (!itemType.includes(' > ')) return false;

        const [, subtype] = itemType.split(' > ');
        return this._selectedSubtypes.includes(subtype.toUpperCase());
      });
    }

    // Apply folder filter if paths are selected
    if (this._folderFilterPaths.length > 0) {
      const hasMatchingPath = (item) => this._folderFilterPaths.some((path) => item.doc === path);
      filtered = filtered.filter(hasMatchingPath);
    }

    // Apply search filter if there's a search query
    if (this._searchQuery && this._searchQuery.trim()) {
      const query = this._searchQuery.toLowerCase().trim();
      filtered = filtered.filter((item) => (item.name && item.name.toLowerCase().includes(query))
        || (item.alt && item.alt.toLowerCase().includes(query))
        || (item.doc && item.doc.toLowerCase().includes(query)));
    }

    // Sort alphabetically by name
    filtered.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return filtered;
  }

  async handleMediaClick(e) {
    const { media } = e.detail;
    if (!media) return;

    try {
      const mediaUrl = media.url || media.mediaUrl;
      if (!mediaUrl) return;

      const mediaType = getMediaType(media);

      if (mediaType === 'image') {
        try {
          await copyImageToClipboard(mediaUrl);
          this._message = { heading: 'Copied', message: 'Image copied to clipboard.', open: true };
        } catch (imageError) {
          // If image copying fails, fall back to copying the image link
          const imageName = media.name || 'Image';
          const imageLink = `<a href="${mediaUrl}" title="${imageName}">${imageName}</a>`;
          await navigator.clipboard.writeText(imageLink);
          this._message = { heading: 'Copied', message: 'Image link copied to clipboard.', open: true };
        }
      } else {
        let clipboardContent = '';

        if (mediaType === 'video') {
          clipboardContent = `<a href="${mediaUrl}" title="${media.name || 'Video'}">${media.name || 'Video'}</a>`;
        } else if (mediaType === 'document') {
          clipboardContent = `<a href="${mediaUrl}" title="${media.name || 'Document'}">${media.name || 'Document'}</a>`;
        } else {
          clipboardContent = `<a href="${mediaUrl}" title="${media.name || 'Media'}">${media.name || 'Media'}</a>`;
        }

        await navigator.clipboard.writeText(clipboardContent);
        this._message = { heading: 'Copied', message: 'Link copied to clipboard.', open: true };
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Show a generic error message if everything fails
      this._message = { heading: 'Error', message: 'Failed to copy to clipboard.', open: true };
    }
  }

  handleMediaInfo(e) {
    const { media } = e.detail;
    this._selectedMedia = media;
    this._infoModalOpen = true;
  }

  handleMediaUsage(e) {
    const { media } = e.detail;
    this._selectedMedia = media;
    this._infoModalOpen = true;
  }

  handleInfoModalClose() {
    this._infoModalOpen = false;
    this._selectedMedia = null;
  }

  handleAltTextUpdated(e) {
    const { media } = e.detail;

    // Update the media data in the main array
    if (this._mediaData) {
      const index = this._mediaData.findIndex((item) => item.mediaUrl === media.mediaUrl);
      if (index !== -1) {
        this._mediaData[index] = { ...this._mediaData[index], ...media };
        this.requestUpdate();
      }
    }
  }

  handleOpenFolderDialog() {
    this._hierarchyDialogOpen = true;
  }

  handleFolderFilterApply(e) {
    const { paths } = e.detail;
    this._folderFilterPaths = paths;
    this._hierarchyDialogOpen = false;
  }

  handleFolderDialogClose() {
    this._hierarchyDialogOpen = false;
  }

  handleFolderFilterChange(e) {
    const { paths } = e.detail;
    this._folderFilterPaths = paths;
    // Real-time filtering - no need to close dialog
  }

  handleClearFolderFilter() {
    this._folderFilterPaths = [];
    // Clear the selected paths in the folder dialog as well
    const folderDialog = this.shadowRoot.querySelector('nx-media-folder-dialog');
    if (folderDialog) {
      folderDialog.selectedPaths = new Set();
    }
  }

  handleToastClose() {
    this._message = null;
  }
}

customElements.define(EL_NAME, NxMediaScanner);

function setupMediaScanner(el) {
  let cmp = document.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    el.append(cmp);
  }

  cmp.sitePath = window.location.hash?.replace('#', '');
}

export default function init(el) {
  el.innerHTML = '';
  setupMediaScanner(el);
  window.addEventListener('hashchange', (e) => {
    setupMediaScanner(el, e);
  });
}
