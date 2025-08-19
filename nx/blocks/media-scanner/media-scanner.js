import { html, LitElement } from 'da-lit';
import getStyle from '../../utils/styles.js';
import runScan, { loadMediaJson, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from './utils/utils.js';
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
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];

    // Start polling for media updates
    this.startPolling();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Stop polling when component is removed
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
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

      // Add a small delay to ensure UI updates are visible
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    };

    try {
      const result = await runScan(this.sitePath, updateTotal, org, repo);
      this._duration = result.duration;
      this._hasChanges = result.hasChanges;

      // Immediately load the new media data after scan completes
      await this.loadMediaData(org, repo);
    } catch (error) {
      // Background scan failed silently
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
      // Failed to load media data silently
    }
  }

  updateFilters() {
    if (!this._mediaData) return;

    // Aggregate media data for filtering (group by mediaUrl)
    const aggregatedMedia = new Map();
    this._mediaData.forEach((item) => {
      const mediaUrl = item.url;
      if (!aggregatedMedia.has(mediaUrl)) {
        aggregatedMedia.set(mediaUrl, {
          ...item,
          mediaUrl, // Ensure consistent field name
          usageCount: 0,
          isUsed: false,
        });
      }
      const aggregated = aggregatedMedia.get(mediaUrl);
      // Count each entry as 1 usage
      aggregated.usageCount += 1;
      // Mark as used if any entry has a doc field
      if (item.doc && item.doc.trim()) {
        aggregated.isUsed = true;
      }
    });

    const aggregatedData = Array.from(aggregatedMedia.values());

    const filters = {
      allMedia: aggregatedData.length,
      images: 0,
      videos: 0,
      documents: 0,
      used: 0,
      unused: 0,
      missingAlt: 0,
    };

    aggregatedData.forEach((item) => {
      if (this.isImage(item.mediaUrl)) {
        filters.images += 1;
        // Only check for missing alt text if it's an img element (not video or link)
        if (!item.alt && item.type && item.type.startsWith('img >')) {
          filters.missingAlt += 1;
        }
      } else if (this.isVideo(item.mediaUrl)) {
        filters.videos += 1;
      } else if (this.isDocument(item.mediaUrl)) {
        filters.documents += 1;
      }

      // Count used vs unused based on doc field
      if (item.isUsed) {
        filters.used += 1;
      } else {
        filters.unused += 1;
      }
    });

    this._filters = filters;
  }

  isImage(path) {
    if (!path) return false;
    const ext = path.split('.').pop()?.toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
  }

  isVideo(path) {
    if (!path) return false;
    const ext = path.split('.').pop()?.toLowerCase();
    return VIDEO_EXTENSIONS.includes(ext);
  }

  isDocument(path) {
    if (!path) return false;
    const ext = path.split('.').pop()?.toLowerCase();
    return ext === 'pdf';
  }

  handleSetSite(e) {
    e.preventDefault();
    window.location.hash = this._siteInput.value;
  }

  get _siteInput() {
    return this.shadowRoot.querySelector('sl-input[name="site"]');
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
          @editAlt=${this.handleEditAlt}
          @altTextUpdated=${this.handleAltTextUpdated}
        ></nx-media-info>
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
    // TODO: Implement search filtering
  }

  handleViewChange(e) {
    this._currentView = e.detail.view;
  }

  handleFilter(e) {
    this._activeFilter = e.detail.type;
    // Only clear subtype filters when changing main filter, but not for missingAlt
    if (e.detail.type !== 'missingAlt') {
      this._selectedSubtypes = [];
    }
  }

  handleSubtypeFilter(e) {
    this._selectedSubtypes = e.detail.subtypes;
  }

  get filteredMediaData() {
    if (!this._mediaData) return [];

    // Aggregate media data for display (group by mediaUrl)
    const aggregatedMedia = new Map();
    this._mediaData.forEach((item) => {
      const mediaUrl = item.url;
      if (!aggregatedMedia.has(mediaUrl)) {
        aggregatedMedia.set(mediaUrl, {
          ...item,
          mediaUrl, // Ensure consistent field name
          usageCount: 0,
          isUsed: false,
        });
      }
      const aggregated = aggregatedMedia.get(mediaUrl);
      // Count each entry as 1 usage
      aggregated.usageCount += 1;
      // Mark as used if any entry has a doc field
      if (item.doc && item.doc.trim()) {
        aggregated.isUsed = true;
      }
    });

    let filtered = Array.from(aggregatedMedia.values());

    // Apply active filter
    switch (this._activeFilter) {
      case 'images':
        filtered = filtered.filter((item) => this.isImage(item.mediaUrl));
        break;
      case 'videos':
        filtered = filtered.filter((item) => this.isVideo(item.mediaUrl));
        break;
      case 'documents':
        filtered = filtered.filter((item) => this.isDocument(item.mediaUrl));
        break;
      case 'used':
        filtered = filtered.filter((item) => item.isUsed);
        break;
      case 'unused':
        filtered = filtered.filter((item) => !item.isUsed);
        break;
      case 'missingAlt':
        // Only show images that are missing alt text, but don't reset other filters
        filtered = filtered.filter((item) => this.isImage(item.mediaUrl) && !item.alt && item.type && item.type.startsWith('img >'));
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

  handleMediaClick() {
    // TODO: Implement media click action
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

  handleEditAlt() {
    // TODO: Implement alt text editing functionality
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

  handlePathSelect() {
    // TODO: Implement path selection
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
