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
    this._expandedFolders = new Set();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  get hierarchyData() {
    if (!this.mediaData) {
      return [];
    }

    const tree = {
      children: new Map(),
      files: new Map(),
      count: 0,
    };

    this.mediaData.forEach((media) => {
      if (!media.doc) {
        return;
      }

      const pathParts = media.doc.split('/').filter(Boolean);

      if (pathParts.length === 0) {
        return;
      }

      if (pathParts.length === 1) {
        const fileName = pathParts[0];
        if (!tree.files.has(fileName)) {
          tree.files.set(fileName, {
            name: fileName,
            path: fileName,
            fullPath: `/${fileName}`,
            type: 'file',
            count: 0,
          });
        }
        tree.files.get(fileName).count += 1;
        tree.count += 1;
        return;
      }

      let currentLevel = tree;

      for (let i = 0; i < pathParts.length - 1; i += 1) {
        const folderName = pathParts[i];

        if (!currentLevel.children.has(folderName)) {
          const folderPath = pathParts.slice(0, i + 1).join('/');
          currentLevel.children.set(folderName, {
            name: folderName,
            path: folderPath,
            fullPath: folderPath,
            type: 'folder',
            children: new Map(),
            files: new Map(),
            count: 0,
            isExpanded: this._expandedFolders.has(folderPath),
          });
        }

        currentLevel = currentLevel.children.get(folderName);
      }

      const fileName = pathParts[pathParts.length - 1];
      if (!currentLevel.files.has(fileName)) {
        currentLevel.files.set(fileName, {
          name: fileName,
          path: pathParts.join('/'),
          fullPath: media.doc,
          type: 'file',
          count: 0,
        });
      }

      currentLevel.files.get(fileName).count += 1;
      currentLevel.count += 1;

      let parent = currentLevel;
      while (parent !== tree) {
        parent.count += 1;
        parent = this.findParent(tree, parent.path);
      }
      tree.count += 1;
    });

    const result = [];

    tree.files.forEach((file) => {
      result.push(file);
    });

    tree.children.forEach((folder) => {
      folder.isExpanded = this._expandedFolders.has(folder.fullPath);

      const folderFiles = Array.from(folder.files.values());
      const folderChildren = Array.from(folder.children.values()).map((child) => ({
        ...child,
        isExpanded: this._expandedFolders.has(child.fullPath),
      }));

      const folderItems = [...folderFiles, ...folderChildren].sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      const folderWithChildren = {
        ...folder,
        children: new Map(folderItems.map((item) => [item.name, item])),
      };
      result.push(folderWithChildren);
    });

    result.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return result;
  }

  findParent(tree, childPath) {
    const pathParts = childPath.split('/');
    if (pathParts.length <= 1) return tree;

    let current = tree;
    for (let i = 0; i < pathParts.length - 1; i += 1) {
      if (current.children.has(pathParts[i])) {
        current = current.children.get(pathParts[i]);
      } else {
        return tree;
      }
    }
    return current;
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

    const hierarchyItem = this.findItemByPath(this.hierarchyData, path);

    if (hierarchyItem && hierarchyItem.type === 'folder') {
      const newExpandedState = !hierarchyItem.isExpanded;

      if (newExpandedState) {
        this._expandedFolders.add(hierarchyItem.fullPath);
      } else {
        this._expandedFolders.delete(hierarchyItem.fullPath);
      }

      this.requestUpdate();
    } else {
      // For files, select and close the dialog
      const newSelectedPaths = new Set(this.selectedPaths);
      if (newSelectedPaths.has(path)) {
        newSelectedPaths.delete(path);
      } else {
        newSelectedPaths.add(path);
      }
      this.selectedPaths = newSelectedPaths;
      this.dispatchEvent(new CustomEvent('filterChange', { detail: { paths: Array.from(this.selectedPaths) } }));
      this.handleClose();
    }
  }

  findItemByPath(items, path) {
    for (const item of items) {
      if (item.fullPath === path) {
        return item;
      }
    }

    for (const item of items) {
      if (item.children && item.children.size > 0) {
        const childItems = Array.from(item.children.values());
        const found = this.findItemByPath(childItems, path);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  handleClose() {
    this.isOpen = false;
    this.dispatchEvent(new CustomEvent('close'));
  }

  handleApply() {
    this.dispatchEvent(new CustomEvent('apply', { detail: { paths: Array.from(this.selectedPaths) } }));
    this.handleClose();
  }

  handleClear() {
    this.selectedPaths = new Set();
    this.dispatchEvent(new CustomEvent('filterChange', { detail: { paths: [] } }));
  }

  render() {
    if (!this.isOpen) return html``;

    const filteredItems = this.filteredHierarchy;

    return html`
      <div class="dialog-overlay" @click=${this.handleClose}>
        <div class="dialog-content" @click=${(e) => e.stopPropagation()}>
          <div class="dialog-header">
            <h2>Filter by Folder Structure</h2>
            <sl-button type="button" size="small" class="primary outline" @click=${this.handleClose}>
              Close
            </sl-button>
          </div>

          <div class="dialog-body">
            <div class="search-container">
              <sl-input type="text"
                placeholder="Search folders & files..."
                .value=${this._searchQuery}
                @input=${this.handleSearch}
                size="large"
              >
                <span slot="prefix">🔍</span>
              </sl-input>
            </div>

            <div class="hierarchy-content">
              ${filteredItems.length === 0 ? html`
                <div class="empty-state">
                  <p>${this._searchQuery ? 'No items found matching your search.' : 'No media files found.'}</p>
                </div>
              ` : html`
                <div class="hierarchy-list">
                  ${this.renderHierarchyItems(filteredItems, 0)}
                </div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderHierarchyItems(items, level = 0) {
    return items.map((item) => html`
      <div class="hierarchy-item-wrapper">
        <div 
          class="hierarchy-item ${this.selectedPaths.has(item.fullPath) ? 'selected' : ''} ${item.type === 'folder' ? 'folder-item' : 'file-item'}"
          data-path="${item.fullPath}"
          @click=${this.handleItemClick}
          style="padding-left: ${level * 16}px;"
        >
          <div class="item-icon">
            ${item.type === 'folder' ? html`
              <div class="folder-icon-container">
                ${(item.children && item.children.size > 0) || (item.files && item.files.size > 0) ? html`
                  <span class="expand-icon ${item.isExpanded ? 'expanded' : ''}">▼</span>
                ` : ''}
              </div>
            ` : ''}
          </div>
          <div class="item-name">
            ${item.name}
          </div>
          <div class="item-count">${item.count}</div>
        </div>
        
        ${item.type === 'folder' && item.isExpanded ? html`
          <div class="folder-children expanded">
            ${(() => {
    const allItems = [];

    if (item.files && item.files.size > 0) {
      const files = Array.from(item.files.values());
      allItems.push(...files);
    }

    if (item.children && item.children.size > 0) {
      const children = Array.from(item.children.values());
      allItems.push(...children);
    }

    allItems.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return this.renderHierarchyItems(allItems, level + 1);
  })()}
          </div>
        ` : ''}
      </div>
    `);
  }
}

customElements.define('nx-media-folder-dialog', NxMediaFolderDialog);
