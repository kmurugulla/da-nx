import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getMediaCounts, getAvailableSubtypes } from '../../utils/utils.js';

const styles = await getStyle(import.meta.url);

class NxMediaSidebar extends LitElement {
  static properties = {
    mediaData: { attribute: false },
    _activeFilter: { state: true },
    _selectedSubtypes: { state: true },
    selectedDocument: { attribute: false },
    documentMediaBreakdown: { attribute: false },
    folderFilterPaths: { attribute: false },
    activeFilter: { attribute: false },
  };

  constructor() {
    super();
    this._selectedSubtypes = new Set();
    this.selectedDocument = null;
    this.documentMediaBreakdown = null;
    this.folderFilterPaths = [];
    this.activeFilter = 'all';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    if (changedProperties.has('activeFilter') && this.activeFilter) {
      this._activeFilter = this.activeFilter;
    }
  }

  handleFilter(e) {
    const filterType = e.target.dataset.filter;
    this._activeFilter = filterType;

    if (filterType !== 'missingAlt') {
      this._selectedSubtypes.clear();
    }

    // Clear document filter when "All Media" is clicked
    if (filterType === 'all' && this.folderFilterPaths && this.folderFilterPaths.length > 0) {
      this.dispatchEvent(new CustomEvent('clearDocumentFilter'));
    }

    this.dispatchEvent(new CustomEvent('filter', { detail: { type: filterType } }));
  }

  handleSubtypeToggle(e) {
    const { value: subtype, checked } = e.target;

    if (checked) {
      this._selectedSubtypes.add(subtype);
    } else {
      this._selectedSubtypes.delete(subtype);
    }

    this.dispatchEvent(new CustomEvent('subtypeFilter', { detail: { subtypes: Array.from(this._selectedSubtypes) } }));
  }

  get mediaCounts() {
    return getMediaCounts(this.mediaData);
  }

  get availableSubtypes() {
    return getAvailableSubtypes(this.mediaData, this._activeFilter);
  }

  getDisplayName(fullPath) {
    if (!fullPath) return '';

    // Extract just the filename from the path
    const pathParts = fullPath.split('/').filter(Boolean);
    const fileName = pathParts[pathParts.length - 1];

    // Remove file extension for cleaner display
    return fileName.replace(/\.[^/.]+$/, '');
  }

  handleDocumentFilter(e) {
    const filterType = e.target.dataset.filter;
    this._activeFilter = filterType;
    this.dispatchEvent(new CustomEvent('documentFilter', {
      detail: {
        type: filterType,
        document: this.selectedDocument,
      },
    }));
  }

  render() {
    const counts = this.mediaCounts;
    const subtypes = this.availableSubtypes;

    return html`
      <aside class="media-sidebar">
        <div class="sidebar-header">
          <h1 class="sidebar-title">Media Library</h1>
        </div>
        <div class="filter-section">
          <h3>FILTERS</h3>
          <ul class="filter-list">
            <li>
              <button 
                data-filter="all" 
                @click=${this.handleFilter}
                class="${this._activeFilter === 'all' ? 'active' : ''}"
              >
                All Media
                <span class="count">${counts.total}</span>
              </button>
            </li>
            <li>
              <button 
                data-filter="images" 
                @click=${this.handleFilter}
                class="${this._activeFilter === 'images' ? 'active' : ''}"
              >
                Images
                <span class="count">${counts.images}</span>
              </button>
            </li>
            ${this._activeFilter === 'images' && subtypes.length > 0 ? html`
              <li class="subtype-container">
                <ul class="subtype-list">
                  ${subtypes.map(({ subtype, count }) => html`
                    <li>
                      <label class="subtype-item">
                        <input 
                          type="checkbox" 
                          value="${subtype}"
                          ?checked=${this._selectedSubtypes.has(subtype)}
                          @change=${this.handleSubtypeToggle}
                        >
                        <span class="subtype-label">${subtype.toUpperCase()}</span>
                        <span class="count">${count}</span>
                      </label>
                    </li>
                  `)}
                </ul>
              </li>
            ` : ''}
            <li>
              <button 
                data-filter="videos" 
                @click=${this.handleFilter}
                class="${this._activeFilter === 'videos' ? 'active' : ''}"
              >
                Videos
                <span class="count">${counts.videos}</span>
              </button>
            </li>
            <li>
              <button 
                data-filter="documents" 
                @click=${this.handleFilter}
                class="${this._activeFilter === 'documents' ? 'active' : ''}"
              >
                Documents
                <span class="count">${counts.documents}</span>
              </button>
            </li>
            <li>
              <button 
                data-filter="links" 
                @click=${this.handleFilter}
                class="${this._activeFilter === 'links' ? 'active' : ''}"
              >
                Links
                <span class="count">${counts.links}</span>
              </button>
            </li>
            ${this._activeFilter === 'links' && subtypes.length > 0 ? html`
              <li class="subtype-container">
                <ul class="subtype-list">
                  ${subtypes.map(({ subtype, count }) => html`
                    <li>
                      <label class="subtype-item">
                        <input 
                          type="checkbox" 
                          value="${subtype}"
                          ?checked=${this._selectedSubtypes.has(subtype)}
                          @change=${this.handleSubtypeToggle}
                        >
                        <span class="subtype-label">${subtype.toUpperCase()}</span>
                        <span class="count">${count}</span>
                      </label>
                    </li>
                  `)}
                </ul>
              </li>
            ` : ''}
            <li>
              <button 
                data-filter="missingAlt" 
                @click=${this.handleFilter}
                class="${this._activeFilter === 'missingAlt' ? 'active' : ''}"
              >
                No Alt
                <span class="count">${counts.missingAlt}</span>
              </button>
            </li>
          </ul>
        </div>

        ${this.selectedDocument && this.documentMediaBreakdown ? html`
          <div class="filter-section">
            <div class="document-header">
              <h3>DOCUMENT FILTERS</h3>
            </div>
            <div class="document-info">
              <div class="document-name" title="${this.selectedDocument}">
                ${this.getDisplayName(this.selectedDocument)}
              </div>
            </div>
            <ul class="filter-list">
              <li>
                <button 
                  data-filter="documentTotal" 
                  @click=${this.handleDocumentFilter}
                  class="${this._activeFilter === 'documentTotal' ? 'active' : ''}"
                >
                  Total Media
                  <span class="count">${this.documentMediaBreakdown.total}</span>
                </button>
              </li>
              ${this.documentMediaBreakdown.images > 0 ? html`
                <li>
                  <button 
                    data-filter="documentImages" 
                    @click=${this.handleDocumentFilter}
                    class="${this._activeFilter === 'documentImages' ? 'active' : ''}"
                  >
                    Images
                    <span class="count">${this.documentMediaBreakdown.images}</span>
                  </button>
                </li>
              ` : ''}
              ${this.documentMediaBreakdown.videos > 0 ? html`
                <li>
                  <button 
                    data-filter="documentVideos" 
                    @click=${this.handleDocumentFilter}
                    class="${this._activeFilter === 'documentVideos' ? 'active' : ''}"
                  >
                    Videos
                    <span class="count">${this.documentMediaBreakdown.videos}</span>
                  </button>
                </li>
              ` : ''}
              ${this.documentMediaBreakdown.documents > 0 ? html`
                <li>
                  <button 
                    data-filter="documentDocuments" 
                    @click=${this.handleDocumentFilter}
                    class="${this._activeFilter === 'documentDocuments' ? 'active' : ''}"
                  >
                    Documents
                    <span class="count">${this.documentMediaBreakdown.documents}</span>
                  </button>
                </li>
              ` : ''}
              ${this.documentMediaBreakdown.links > 0 ? html`
                <li>
                  <button 
                    data-filter="documentLinks" 
                    @click=${this.handleDocumentFilter}
                    class="${this._activeFilter === 'documentLinks' ? 'active' : ''}"
                  >
                    Links
                    <span class="count">${this.documentMediaBreakdown.links}</span>
                  </button>
                </li>
              ` : ''}
              ${this.documentMediaBreakdown.missingAlt > 0 ? html`
                <li>
                  <button 
                    data-filter="documentMissingAlt" 
                    @click=${this.handleDocumentFilter}
                    class="${this._activeFilter === 'documentMissingAlt' ? 'active' : ''}"
                  >
                    No Alt
                    <span class="count">${this.documentMediaBreakdown.missingAlt}</span>
                  </button>
                </li>
              ` : ''}
            </ul>
          </div>
        ` : ''}
      </aside>
    `;
  }
}

customElements.define('nx-media-sidebar', NxMediaSidebar);
