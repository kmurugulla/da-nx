import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);
const ICONS = [
  `${nx}/img/icons/S2IconFolder20N-icon.svg`,
  `${nx}/img/icons/S2IconClassicGridView20N-icon.svg`,
  `${nx}/public/icons/S2_Icon_ListBulleted_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Close_20_N.svg`,
];

class NxMediaTopBar extends LitElement {
  static properties = {
    searchQuery: { attribute: false },
    _currentView: { state: true },
    currentView: { attribute: false },
    _isScanning: { state: true },
    _scanProgress: { state: true },
    _duration: { state: true },
    _hasChanges: { state: true },
    folderFilterPaths: { attribute: false },
  };

  constructor() {
    super();
    this._currentView = 'grid';
    this._isScanning = false;
    this._scanProgress = { pages: 0, media: 0 };
    this._duration = null;
    this._hasChanges = null;
    this._statusTimeout = null;
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    if (changedProperties.has('currentView') && this.currentView) {
      this._currentView = this.currentView;
    }

    if (this._duration && !this._isScanning && !this._statusTimeout) {
      this.setScanStatusTimeout();
    }

    if (this._isScanning && this._statusTimeout) {
      clearTimeout(this._statusTimeout);
      this._statusTimeout = null;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];

    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  handleSearch(e) {
    this.dispatchEvent(new CustomEvent('search', { detail: { query: e.target.value } }));
  }

  handleViewChange(e) {
    const button = e.target.closest('button') || e.target;
    const { view } = button.dataset;
    this._currentView = view;
    this.dispatchEvent(new CustomEvent('viewChange', { detail: { view } }));
  }

  handleFolderClick() {
    this.dispatchEvent(new CustomEvent('openFolderDialog'));
  }

  setScanStatusTimeout(duration = 5000) {
    if (this._statusTimeout) {
      clearTimeout(this._statusTimeout);
    }

    this._statusTimeout = setTimeout(() => {
      this.dispatchEvent(new CustomEvent('clearScanStatus'));
      this._statusTimeout = null;
    }, duration);
  }

  handleClearFolderFilter() {
    this.dispatchEvent(new CustomEvent('clearFolderFilter'));
  }

  renderScanningStatus() {
    if (this._isScanning) {
      return html`
        <div class="scanning-indicator">
          <div class="spinner"></div>
          <span class="scanning-text">
            Scanning... ${this._scanProgress.pages} pages, ${this._scanProgress.media} media files
          </span>
        </div>
      `;
    }

    if (this._duration) {
      const durationText = ` (${this._duration})`;

      if (this._hasChanges === false) {
        return html`
          <div class="scanning-indicator completed">
            <span class="scanning-text">
              No changes found${durationText}
            </span>
          </div>
        `;
      }

      return html`
        <div class="scanning-indicator completed">
          <span class="scanning-text">
            ${this._scanProgress.pages} pages, ${this._scanProgress.media} media files${durationText}
          </span>
        </div>
      `;
    }

    return '';
  }

  render() {
    return html`
      <div class="top-bar">
        <div class="search-container">
          <sl-input
            type="text"
            placeholder="Search media..."
            .value=${this.searchQuery}
            @input=${this.handleSearch}
          >
          </sl-input>
        </div>

        <div class="scanning-status">
          ${this.renderScanningStatus()}
        </div>

        <div class="view-controls">
          <button
            class="view-btn ${this._currentView === 'grid' ? 'active' : ''}"
            data-view="grid"
            @click=${this.handleViewChange}
            title="Grid view"
          >
            <svg class="icon">
              <use href="#S2IconClassicGridView20N-icon"></use>
            </svg>
          </button>
          <button
            class="view-btn ${this._currentView === 'list' ? 'active' : ''}"
            data-view="list"
            @click=${this.handleViewChange}
            title="List view"
          >
            <svg class="icon">
              <use href="#S2_Icon_ListBulleted_20_N"></use>
            </svg>
          </button>
          <button
            class="view-btn folder-btn ${this.folderFilterPaths && this.folderFilterPaths.length > 0 ? 'active' : ''}"
            title="Folder view"
            @click=${this.handleFolderClick}
          >
            <svg class="icon">
              <use href="#S2IconFolder20N-icon"></use>
            </svg>
            ${this.folderFilterPaths && this.folderFilterPaths.length > 0 ? html`
              <span class="filter-badge">${this.folderFilterPaths.length}</span>
            ` : ''}
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-media-topbar', NxMediaTopBar);
