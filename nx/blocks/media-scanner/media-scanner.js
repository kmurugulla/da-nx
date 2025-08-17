import { html, LitElement } from 'da-lit';
import getStyle from '../../utils/styles.js';
import runScan, { loadMediaJson } from './utils/utils.js';
import '../../public/sl/components.js';

// Import view components
import './views/topbar/topbar.js';
import './views/sidebar/sidebar.js';
import './views/grid/grid.js';
import './views/folder/folder.js';
import './views/list/list.js';

const EL_NAME = 'nx-media-scanner';

// Styles
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

class NxMediaScanner extends LitElement {
  static properties = {
    sitePath: { attribute: false },
    _error: { state: true },
    _sitePathError: { state: true },
    _pageTotal: { state: true },
    _mediaTotal: { state: true },
    _duration: { state: true },
    _mediaData: { state: true },
    _filters: { state: true },
    _searchQuery: { state: true },
    _isScanning: { state: true },
    _currentView: { state: true },
    _scanProgress: { state: true },
    _hierarchyDialogOpen: { state: true },
  };

  constructor() {
    super();
    this._currentView = 'grid';
    this._scanProgress = { pages: 0, media: 0 };
    this._hierarchyDialogOpen = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];

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
    console.log(`Scanning ${this.sitePath}`);
    const [org, repo] = this.sitePath.split('/').slice(1, 3);

    // Load existing media data immediately
    await this.loadMediaData(org, repo);

    // Start background scan (non-blocking)
    this.startBackgroundScan(org, repo);
  }

  async startBackgroundScan(org, repo) {
    this._isScanning = true;

    const updateTotal = async (type, count) => {
      if (type === 'page') {
        this._pageTotal = count;
        this._scanProgress = { ...this._scanProgress, pages: count };
        this.requestUpdate();
        console.log(`Pages: ${count}`);
      }
      if (type === 'media') {
        this._mediaTotal = count;
        this._scanProgress = { ...this._scanProgress, media: count };
        this.requestUpdate();
        console.log(`Media: ${count}`);
      }
      
      // Add a small delay to ensure UI updates are visible
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    };

    try {
      const duration = await runScan(this.sitePath, updateTotal, org, repo);
      this._duration = duration;
      console.log('Background scan completed');
      
      // Immediately load the new media data after scan completes
      await this.loadMediaData(org, repo);
      console.log('Media data loaded after scan');
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

    const filters = {
      allMedia: this._mediaData.length,
      images: 0,
      videos: 0,
      documents: 0,
      missingAlt: 0,
    };

    this._mediaData.forEach((item) => {
      if (this.isImage(item.path)) {
        filters.images += 1;
        if (!item.altText) filters.missingAlt += 1;
      } else if (this.isVideo(item.path)) {
        filters.videos += 1;
      } else if (this.isDocument(item.path)) {
        filters.documents += 1;
      }
    });

    this._filters = filters;
  }

  isImage(path) {
    const ext = path.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
  }

  isVideo(path) {
    const ext = path.split('.').pop()?.toLowerCase();
    return ext === 'mp4';
  }

  isDocument(path) {
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

  render() {
    return html`
      <div class="media-library">
        <nx-media-topbar
          .searchQuery=${this._searchQuery}
          .currentView=${this._currentView}
          .isScanning=${this._isScanning}
          .scanProgress=${this._scanProgress}
          @search=${this.handleSearch}
          @viewChange=${this.handleViewChange}
          @openHierarchy=${this.handleOpenHierarchy}
        ></nx-media-topbar>
        
        <div class="media-content">
          <nx-media-sidebar
            .mediaData=${this._mediaData}
            @filter=${this.handleFilter}
          ></nx-media-sidebar>
          
          ${this.renderCurrentView()}
        </div>
        
        <nx-media-folder-dialog
          .mediaData=${this._mediaData}
          .isOpen=${this._hierarchyDialogOpen}
          @close=${this.handleHierarchyClose}
          @apply=${this.handleHierarchyApply}
          @filterChange=${this.handleHierarchyFilterChange}
        ></nx-media-folder-dialog>
      </div>
    `;
  }

  renderCurrentView() {
    switch (this._currentView) {
      case 'list':
        return html`
          <nx-media-list
            .mediaData=${this._mediaData}
            .sitePath=${this.sitePath}
            @mediaClick=${this.handleMediaClick}
          ></nx-media-list>
        `;
      case 'grid':
      default:
        return html`
          <nx-media-grid
            .mediaData=${this._mediaData}
            .sitePath=${this.sitePath}
            @mediaClick=${this.handleMediaClick}
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
    const { type } = e.detail;
    // TODO: Implement filter logic
    console.log('Filter:', type);
  }

  handleMediaClick(e) {
    const { mediaPath } = e.detail;
    // TODO: Implement media click action
    console.log('Media clicked:', mediaPath);
  }

  handlePathSelect(e) {
    const { path } = e.detail;
    // TODO: Implement path selection
    console.log('Path selected:', path);
  }

  handleOpenHierarchy() {
    this._hierarchyDialogOpen = true;
  }

  handleHierarchyClose() {
    this._hierarchyDialogOpen = false;
  }

  handleHierarchyApply(e) {
    const { paths } = e.detail;
    // TODO: Apply hierarchy filter
    console.log('Applying hierarchy filter:', paths);
    this._hierarchyDialogOpen = false;
  }

  handleHierarchyFilterChange(e) {
    const { paths } = e.detail;
    // TODO: Update hierarchy filter
    console.log('Hierarchy filter changed:', paths);
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
