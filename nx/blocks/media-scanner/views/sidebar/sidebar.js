import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getMediaCounts, getAvailableSubtypes } from '../../utils/utils.js';

const styles = await getStyle(import.meta.url);

class NxMediaSidebar extends LitElement {
  static properties = {
    mediaData: { attribute: false },
    _activeFilter: { state: true },
    _selectedSubtypes: { state: true },
  };

  constructor() {
    super();
    this._selectedSubtypes = new Set();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  handleFilter(e) {
    const filterType = e.target.dataset.filter;
    this._activeFilter = filterType;

    if (filterType !== 'missingAlt') {
      this._selectedSubtypes.clear();
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

  render() {
    const counts = this.mediaCounts;
    const subtypes = this.availableSubtypes;

    return html`
      <aside class="media-sidebar">
        <div class="sidebar-header">
          <h1 class="sidebar-title">Media Library</h1>
        </div>
        <div class="filter-section">
          <h3>MEDIA TYPES</h3>
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
            ${subtypes.length > 0 ? html`
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
          </ul>
        </div>

        <div class="filter-section">
          <h3>USAGE STATUS</h3>
          <ul class="filter-list">
            <li>
              <button 
                data-filter="missingAlt" 
                @click=${this.handleFilter}
                class="${this._activeFilter === 'missingAlt' ? 'active' : ''}"
              >
                Missing Alt Text
                <span class="count">${counts.missingAlt}</span>
              </button>
            </li>
            <li>
              <button 
                data-filter="used" 
                @click=${this.handleFilter}
                class="${this._activeFilter === 'used' ? 'active' : ''}"
              >
                Used Media
                <span class="count">${counts.used}</span>
              </button>
            </li>
            <li>
              <button 
                data-filter="unused" 
                @click=${this.handleFilter}
                class="${this._activeFilter === 'unused' ? 'active' : ''}"
              >
                Unused Media
                <span class="count">${counts.unused}</span>
              </button>
            </li>
          </ul>
        </div>
      </aside>
    `;
  }
}

customElements.define('nx-media-sidebar', NxMediaSidebar);
