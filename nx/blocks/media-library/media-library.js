import { html, LitElement } from 'da-lit';
import getStyle from '../../utils/styles.js';
import getSvg from '../../public/utils/svg.js';
import runScan, {
  loadMediaJson,
  copyMediaToClipboard,
  getMediaCounts,
  getDocumentMediaBreakdown,
  aggregateMediaData,
  getMediaType,
} from './utils/utils.js';
import '../../public/sl/components.js';
import './views/topbar/topbar.js';
import './views/sidebar/sidebar.js';
import './views/grid/grid.js';
import './views/folder/folder.js';
import './views/list/list.js';
import './views/mediainfo/mediainfo.js';

const EL_NAME = 'nx-media-library';
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const styles = await getStyle(import.meta.url);

const ICONS = [
  `${nx}/public/icons/S2_Icon_Close_20_N.svg`,
];

class NxMediaLibrary extends LitElement {
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
    this._pollingStarted = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];

    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
    }
  }

  startPolling() {
    this._pollingInterval = setInterval(async () => {
      if (this.sitePath) {
        const [org, repo] = this.sitePath.split('/').slice(1, 3);
        if (org && repo) {
          await this.loadMediaData(org, repo);
        } else {
          console.warn('Invalid org/repo from sitePath:', this.sitePath);
        }
      }
    }, 60000);
  }

  update(props) {
    if (props.has('sitePath') && this.sitePath) {
      if (!this._pollingStarted) {
        this.startPolling();
        this._pollingStarted = true;
      }
      this.scan();
    }
    super.update();
  }

  async scan() {
    const [org, repo] = this.sitePath.split('/').slice(1, 3);

    await this.loadMediaData(org, repo);

    this.startBackgroundScan(org, repo);
  }

  async startBackgroundScan(org, repo) {
    this._isScanning = true;

    try {
      const result = await runScan(this.sitePath, this.updateScanProgress.bind(this), org, repo);
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

  updateScanProgress(type, totalScanned, processedCount) {
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

    return new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  async startPollingBackgroundScan(org, repo) {
    try {
      this._isScanning = true;
      await runScan(this.sitePath, this.updateScanProgress.bind(this), org, repo);
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

  get selectedDocument() {
    if (this._folderFilterPaths && this._folderFilterPaths.length > 0) {
      return this._folderFilterPaths[0];
    }

    if (this._mediaData && this._mediaData.length > 0) {
      const indexDoc = this._mediaData.find((media) => media.doc === '/index.html');
      if (indexDoc) {
        return '/index.html';
      }

      const firstDoc = this._mediaData.find((media) => media.doc && media.doc.trim());
      if (firstDoc) {
        return firstDoc.doc;
      }
    }

    return null;
  }

  get documentMediaBreakdown() {
    if (!this.selectedDocument || !this._mediaData) {
      return null;
    }
    return getDocumentMediaBreakdown(this._mediaData, this.selectedDocument);
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
          @clearScanStatus=${this.handleClearScanStatus}
        ></nx-media-topbar>
        
        <nx-media-sidebar
          .mediaData=${this._mediaData}
          .activeFilter=${this._activeFilter}
          .selectedDocument=${this.selectedDocument}
          .documentMediaBreakdown=${this.documentMediaBreakdown}
          .folderFilterPaths=${this._folderFilterPaths}
          @filter=${this.handleFilter}
          @subtypeFilter=${this.handleSubtypeFilter}
          @clearDocumentFilter=${this.handleClearDocumentFilter}
          @documentFilter=${this.handleDocumentFilter}
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
      case 'links':
        filtered = filtered.filter((item) => getMediaType(item) === 'link');
        break;
      case 'used':
        filtered = filtered.filter((item) => item.isUsed);
        break;
      case 'unused':
        filtered = filtered.filter((item) => !item.isUsed);
        break;
      case 'missingAlt':
        filtered = filtered.filter((item) => getMediaType(item) === 'image' && !item.alt && item.type && item.type.startsWith('img >'));
        break;
      case 'documentTotal':
        break;
      case 'documentImages':
        filtered = filtered.filter((item) => getMediaType(item) === 'image');
        break;
      case 'documentVideos':
        filtered = filtered.filter((item) => getMediaType(item) === 'video');
        break;
      case 'documentDocuments':
        filtered = filtered.filter((item) => getMediaType(item) === 'document');
        break;
      case 'documentLinks':
        filtered = filtered.filter((item) => getMediaType(item) === 'link');
        break;
      case 'documentMissingAlt':
        filtered = filtered.filter((item) => getMediaType(item) === 'image' && !item.alt && item.type && item.type.startsWith('img >'));
        break;
      case 'all':
      default:
        break;
    }

    if (this._selectedSubtypes.length > 0) {
      filtered = filtered.filter((item) => {
        const itemType = item.type || '';

        if (!itemType.includes(' > ')) return false;

        if (!(itemType.startsWith('img >') || itemType.startsWith('link >'))) return false;

        const [, subtype] = itemType.split(' > ');
        return this._selectedSubtypes.includes(subtype.toUpperCase());
      });
    }

    if (this._folderFilterPaths.length > 0) {
      const hasMatchingPath = (item) => this._folderFilterPaths.some((path) => item.doc === path);
      filtered = filtered.filter(hasMatchingPath);
    }

    if (this._searchQuery && this._searchQuery.trim()) {
      const query = this._searchQuery.toLowerCase().trim();
      filtered = filtered.filter((item) => (item.name && item.name.toLowerCase().includes(query))
        || (item.alt && item.alt.toLowerCase().includes(query))
        || (item.doc && item.doc.toLowerCase().includes(query)));
    }

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
      const result = await copyMediaToClipboard(media);
      this.setMessage({ ...result, open: true });
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      this.setMessage({ heading: 'Error', message: 'Failed to copy to clipboard.', open: true });
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
  }

  handleClearFolderFilter() {
    this._folderFilterPaths = [];
    const folderDialog = this.shadowRoot.querySelector('nx-media-folder-dialog');
    if (folderDialog) {
      folderDialog.selectedPaths = new Set();
    }
  }

  handleClearDocumentFilter() {
    this._folderFilterPaths = [];
    const folderDialog = this.shadowRoot.querySelector('nx-media-folder-dialog');
    if (folderDialog) {
      folderDialog.selectedPaths = new Set();
    }
  }

  handleDocumentFilter(e) {
    const { type } = e.detail;
    this._activeFilter = type;
  }

  handleClearScanStatus() {
    this._duration = null;
    this._hasChanges = null;
  }

  setMessage(message, duration = 3000) {
    this._message = message;

    if (this._messageTimeout) {
      clearTimeout(this._messageTimeout);
    }

    this._messageTimeout = setTimeout(() => {
      this._message = null;
      this._messageTimeout = null;
    }, duration);
  }

  handleToastClose() {
    this._message = null;
    if (this._messageTimeout) {
      clearTimeout(this._messageTimeout);
      this._messageTimeout = null;
    }
  }
}

customElements.define(EL_NAME, NxMediaLibrary);

function setupMediaLibrary(el) {
  let cmp = document.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    el.append(cmp);
  }

  cmp.sitePath = window.location.hash?.replace('#', '');
}

export default function init(el) {
  el.innerHTML = '';
      setupMediaLibrary(el);
  window.addEventListener('hashchange', (e) => {
          setupMediaLibrary(el, e);
  });
}
