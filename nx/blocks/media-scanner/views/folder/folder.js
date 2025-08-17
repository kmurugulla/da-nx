import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';

const styles = await getStyle(import.meta.url);

class NxMediaFolderDialog extends LitElement {
  static properties = {
    mediaData: { attribute: false },
    isOpen: { attribute: false },
    selectedPaths: { attribute: false },
  };

  constructor() {
    super();
    this.isOpen = false;
    this.selectedPaths = new Set();
    this._searchQuery = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  get hierarchyData() {
    if (!this.mediaData) return [];

    const hierarchy = {};

    this.mediaData.forEach((media) => {
      const pathParts = media.mediaPath.split('/');
      let currentPath = '';

      pathParts.forEach((part, index) => {
        if (index === 0) {
          currentPath = part;
        } else {
          currentPath = `${currentPath}/${part}`;
        }

        if (!hierarchy[currentPath]) {
          hierarchy[currentPath] = {
            name: part,
            fullPath: currentPath,
            type: index === pathParts.length - 1 ? 'file' : 'folder',
            count: 0,
            children: [],
          };
        }

        if (index === pathParts.length - 1) {
          hierarchy[currentPath].count += 1;
        }
      });
    });

    return Object.values(hierarchy).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  get filteredHierarchy() {
    const items = this.hierarchyData;
    if (!this._searchQuery) return items;

    return items.filter((item) => item.name.toLowerCase().includes(this._searchQuery.toLowerCase())
      || item.fullPath.toLowerCase().includes(this._searchQuery.toLowerCase()));
  }

  handleSearch(e) {
    this._searchQuery = e.target.value;
    this.requestUpdate();
  }

  handleItemClick(e) {
    const item = e.currentTarget;
    const { path } = item.dataset;
    const newSelectedPaths = new Set(this.selectedPaths);

    if (newSelectedPaths.has(path)) {
      newSelectedPaths.delete(path);
    } else {
      newSelectedPaths.add(path);
    }

    this.selectedPaths = newSelectedPaths;
    this.dispatchEvent(new CustomEvent('filterChange', {
      detail: { paths: Array.from(this.selectedPaths) },
    }));
  }

  handleClose() {
    this.isOpen = false;
    this.dispatchEvent(new CustomEvent('close'));
  }

  handleApply() {
    this.dispatchEvent(new CustomEvent('apply', {
      detail: { paths: Array.from(this.selectedPaths) },
    }));
    this.handleClose();
  }

  handleClear() {
    this.selectedPaths = new Set();
    this.dispatchEvent(new CustomEvent('filterChange', {
      detail: { paths: [] },
    }));
  }

  render() {
    if (!this.isOpen) return html``;

    const filteredItems = this.filteredHierarchy;
    const selectedCount = this.selectedPaths.size;

    return html`
      <div class="dialog-overlay" @click=${this.handleClose}>
        <div class="dialog-content" @click=${(e) => e.stopPropagation()}>
          <div class="dialog-header">
            <h2>Filter by Folder Structure</h2>
            <sl-button size="small" variant="neutral" @click=${this.handleClose}>
              <svg slot="prefix">
                <use href="#S2IconClose20N-icon"></use>
              </svg>
            </sl-button>
          </div>

          <div class="dialog-body">
            <div class="search-container">
              <sl-input 
                placeholder="Search folders & files..."
                .value=${this._searchQuery}
                @input=${this.handleSearch}
              >
                <svg slot="prefix">
                  <use href="#S2IconDiscover20N-icon"></use>
                </svg>
              </sl-input>
            </div>

            <div class="hierarchy-content">
              ${filteredItems.length === 0 ? html`
                <div class="empty-state">
                  <p>${this._searchQuery ? 'No items found matching your search.' : 'No media files found.'}</p>
                </div>
              ` : html`
                <div class="hierarchy-list">
                  ${filteredItems.map((item) => html`
                    <div 
                      class="hierarchy-item ${this.selectedPaths.has(item.fullPath) ? 'selected' : ''}"
                      data-path="${item.fullPath}"
                      @click=${this.handleItemClick}
                    >
                      <div class="item-icon">
                        ${item.type === 'folder' ? html`
                          <svg class="folder-icon">
                            <use href="#S2IconFolder20N-icon"></use>
                          </svg>
                        ` : html`
                          <svg class="file-icon">
                            <use href="#S2IconHome20N-icon"></use>
                          </svg>
                        `}
                      </div>
                      <div class="item-name">
                        ${item.type === 'folder' ? html`
                          <svg class="folder-icon">
                            <use href="#S2IconFolder20N-icon"></use>
                          </svg>
                          ${item.name}
                        ` : item.name}
                      </div>
                      <div class="item-count">${item.count}</div>
                    </div>
                  `)}
                </div>
              `}
            </div>
          </div>

          <div class="dialog-footer">
            <div class="selected-count">
              ${selectedCount > 0 ? html`${selectedCount} selected` : 'No filters selected'}
            </div>
            <div class="footer-actions">
              <sl-button size="small" variant="neutral" @click=${this.handleClear}>
                Clear All
              </sl-button>
              <sl-button size="small" variant="neutral" @click=${this.handleClose}>
                Cancel
              </sl-button>
              <sl-button 
                size="small" 
                variant="primary" 
                ?disabled=${selectedCount === 0}
                @click=${this.handleApply}
              >
                Apply Filter
              </sl-button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-media-folder-dialog', NxMediaFolderDialog);
