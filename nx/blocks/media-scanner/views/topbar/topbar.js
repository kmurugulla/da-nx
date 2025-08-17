import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';

const styles = await getStyle(import.meta.url);

class NxMediaTopBar extends LitElement {
  static properties = {
    searchQuery: { attribute: false },
    currentView: { attribute: false },
    isScanning: { attribute: false },
    scanProgress: { attribute: false },
  };

  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has('scanProgress')) {
      console.log('Topbar scanProgress updated:', this.scanProgress);
    }
    if (changedProperties.has('isScanning')) {
      console.log('Topbar isScanning updated:', this.isScanning);
    }
  }

  constructor() {
    super();
    this.currentView = 'grid';
    this.isScanning = false;
    this.scanProgress = { pages: 0, media: 0 };
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  handleSearch(e) {
    this.dispatchEvent(new CustomEvent('search', { detail: { query: e.target.value } }));
  }

  handleViewChange(e) {
    const { view } = e.target.dataset;
    this.currentView = view;
    this.dispatchEvent(new CustomEvent('viewChange', { detail: { view } }));
  }

  handleHierarchyClick() {
    this.dispatchEvent(new CustomEvent('openHierarchy'));
  }

  renderScanningStatus() {
    if (this.isScanning) {
      return html`
        <div class="scanning-indicator">
          <div class="spinner"></div>
          <span class="scanning-text">
            Scanning... ${this.scanProgress.pages} pages, ${this.scanProgress.media} media files
          </span>
        </div>
      `;
    }

    if (this.scanProgress.pages > 0 || this.scanProgress.media > 0) {
      return html`
        <div class="scanning-indicator completed">
          <span class="scanning-text">
            ${this.scanProgress.pages} pages, ${this.scanProgress.media} media files
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
            placeholder="Search media..."
            .value=${this.searchQuery}
            @input=${this.handleSearch}
          >
            <svg slot="prefix" class="search-icon">
              <use href="#S2IconDiscover20N-icon"></use>
            </svg>
          </sl-input>
        </div>
        
        <div class="scanning-status">
          ${this.renderScanningStatus()}
        </div>
        
        <div class="view-controls">
          <button 
            class="view-btn filter-btn"
            title="Filter by folder structure"
            @click=${this.handleHierarchyClick}
          >
            <svg class="icon">
              <use href="#S2IconFolder20N-icon"></use>
            </svg>
            Filter
          </button>
          <button 
            class="view-btn ${this.currentView === 'grid' ? 'active' : ''}"
            data-view="grid"
            @click=${this.handleViewChange}
          >
            Grid
          </button>
          <button 
            class="view-btn ${this.currentView === 'list' ? 'active' : ''}"
            data-view="list"
            @click=${this.handleViewChange}
          >
            List
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-media-topbar', NxMediaTopBar);
