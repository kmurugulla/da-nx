import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { IMAGE_EXTENSIONS, getDisplayMediaType } from '../../utils/utils.js';

const styles = await getStyle(import.meta.url);

class NxMediaList extends LitElement {
  static properties = {
    mediaData: { attribute: false },
    isScanning: { attribute: false },
    _visibleStart: { state: true },
    _visibleEnd: { state: true },
    _itemHeight: { state: true },
    _scrollTimeout: { state: true },
    _bufferSize: { state: true },
    _renderedItems: { state: true },

    _scrollListenerAttached: { state: true },
  };

  constructor() {
    super();
    this._visibleStart = 0;
    this._visibleEnd = 100;
    this._itemHeight = 80;
    this._scrollTimeout = null;
    this._bufferSize = 8;
    this._renderedItems = new Set();
    this._scrollListenerAttached = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._scrollTimeout) {
      clearTimeout(this._scrollTimeout);
    }
    if (this._container && this._scrollListenerAttached) {
      this._container.removeEventListener('scroll', this._onScroll);
      this._scrollListenerAttached = false;
    }
  }

  firstUpdated() {
    window.addEventListener('resize', () => this._updateVisibleRange());
  }

  updated(changedProperties) {
    if (changedProperties.has('mediaData') && this.mediaData && this.mediaData.length > 0) {
      this.updateComplete.then(() => {
        this._container = this.shadowRoot.querySelector('.list-content');
        if (this._container && !this._scrollListenerAttached) {
          this._container.addEventListener('scroll', this._onScroll.bind(this));
          this._scrollListenerAttached = true;
        }
      });
    }
  }

  shouldUpdate(changedProperties) {
    if (changedProperties.has('mediaData')) {
      this._visibleStart = 0;
      this._visibleEnd = Math.min(100, this.mediaData?.length || 0);
      this._renderedItems.clear();
      return true;
    }

    if (changedProperties.has('_visibleStart') || changedProperties.has('_visibleEnd')) {
      return false;
    }

    return false;
  }

  _onScroll() {
    if (!this._container || !this.mediaData) return;

    if (this._scrollTimeout) {
      clearTimeout(this._scrollTimeout);
    }

    this._scrollTimeout = setTimeout(() => {
      this._updateVisibleRange();
    }, 16);
  }

  _updateVisibleRange() {
    if (!this._container || !this.mediaData) return;

    const { scrollTop } = this._container;
    const containerHeight = this._container.clientHeight;
    const scrollBottom = scrollTop + containerHeight;

    const startItem = Math.floor(scrollTop / this._itemHeight);
    const endItem = Math.ceil(scrollBottom / this._itemHeight);

    const bufferStartItem = Math.max(0, startItem - this._bufferSize);
    const bufferEndItem = Math.min(this.mediaData.length, endItem + this._bufferSize);

    const newStart = bufferStartItem;
    const newEnd = bufferEndItem;

    const needsUpdate = this._needsUpdate(newStart, newEnd);

    if (needsUpdate) {
      const oldStart = this._visibleStart;
      const oldEnd = this._visibleEnd;

      this._visibleStart = newStart;
      this._visibleEnd = newEnd;

      this._updateItemsIncremental(oldStart, oldEnd, newStart, newEnd);
    }
  }

  _needsUpdate(newStart, newEnd) {
    for (let i = newStart; i < newEnd; i += 1) {
      if (!this._renderedItems.has(i)) {
        return true;
      }
    }

    for (let i = this._visibleStart; i < this._visibleEnd; i += 1) {
      if (i < newStart || i >= newEnd) {
        return true;
      }
    }

    return false;
  }

  _updateItemsIncremental(oldStart, oldEnd, newStart, newEnd) {
    const itemsToAdd = [];

    for (let i = newStart; i < newEnd; i += 1) {
      if (!this._renderedItems.has(i)) {
        itemsToAdd.push(i);
      }
    }

    const itemsToRemove = [];
    for (let i = oldStart; i < Math.min(oldEnd, newStart); i += 1) {
      itemsToRemove.push(i);
      this._renderedItems.delete(i);
    }

    if (itemsToAdd.length > 0 || itemsToRemove.length > 0) {
      this._performIncrementalDOMUpdate(itemsToAdd, itemsToRemove);
    }
  }

  _performIncrementalDOMUpdate(itemsToAdd, itemsToRemove) {
    const container = this.shadowRoot.querySelector('.list-grid');
    if (!container) return;

    itemsToRemove.forEach((itemIndex) => {
      const itemElement = container.querySelector(`[data-index="${itemIndex}"]`);
      if (itemElement) {
        itemElement.remove();
      }
    });

    itemsToAdd.forEach((itemIndex) => {
      const media = this.mediaData[itemIndex];
      if (!media) return;

      const itemElement = this._createItemElement(media, itemIndex);
      container.appendChild(itemElement);

      this._renderedItems.add(itemIndex);
    });
  }

  _createItemElement(media, itemIndex) {
    const top = itemIndex * this._itemHeight;

    const itemElement = document.createElement('div');
    itemElement.className = 'media-item';
    itemElement.dataset.path = media.mediaUrl;
    itemElement.dataset.index = itemIndex;
    itemElement.style.cssText = `top:${top}px; height:${this._itemHeight}px;`;

    itemElement.addEventListener('click', this.handleMediaClick.bind(this));

    const previewDiv = document.createElement('div');
    previewDiv.className = 'item-preview clickable';
    previewDiv.title = 'Click to copy media URL';
    previewDiv.innerHTML = this._renderMediaPreviewHTML(media);

    const nameDiv = document.createElement('div');
    nameDiv.className = 'item-name';
    nameDiv.textContent = this.getMediaName(media);

    const typeDiv = document.createElement('div');
    typeDiv.className = 'item-type';
    typeDiv.textContent = getDisplayMediaType(media);

    const usageDiv = document.createElement('div');
    usageDiv.className = 'item-usage';
    const usageSpan = document.createElement('span');
    usageSpan.className = 'usage-badge used clickable';
    usageSpan.title = 'View usage details';
    usageSpan.textContent = `Usage (${media.usageCount || 0})`;
    usageDiv.appendChild(usageSpan);

    const altDiv = document.createElement('div');
    altDiv.className = 'item-alt';
    if (!media.alt && media.type && media.type.startsWith('img >')) {
      const noAltSpan = document.createElement('span');
      noAltSpan.className = 'missing-alt-indicator clickable';
      noAltSpan.title = 'View usage details';
      noAltSpan.textContent = 'NO ALT';
      altDiv.appendChild(noAltSpan);
    } else {
      const altPresentSpan = document.createElement('span');
      altPresentSpan.className = 'alt-present';
      altPresentSpan.textContent = '✓';
      altDiv.appendChild(altPresentSpan);
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'item-actions';
    const infoButton = document.createElement('sl-button');
    infoButton.variant = 'primary';
    infoButton.size = 'small';
    infoButton.title = 'View details';
    infoButton.textContent = 'INFO';
    actionsDiv.appendChild(infoButton);

    itemElement.append(previewDiv, nameDiv, typeDiv, usageDiv, altDiv, actionsDiv);

    previewDiv.addEventListener('click', (e) => this.handlePreviewClick(e, media));
    usageSpan.addEventListener('click', (e) => this.handleUsageClick(e, media));
    if (altDiv.querySelector('.missing-alt-indicator')) {
      altDiv.querySelector('.missing-alt-indicator').addEventListener('click', (e) => this.handleUsageClick(e, media));
    }
    infoButton.addEventListener('click', (e) => this.handleInfoClick(e, media));

    return itemElement;
  }

  _renderMediaPreviewHTML(media) {
    const ext = media.mediaUrl.split('.').pop()?.toLowerCase();

    if (this.isImage(media.mediaUrl)) {
      const imageUrl = media.mediaUrl;
      return `<img src="${imageUrl}" alt="${media.alt || ''}" loading="lazy">`;
    }

    if (ext === 'mp4') {
      return `
        <video 
          src="${media.mediaUrl}" 
          preload="metadata"
          muted
          @loadedmetadata=${this.handleVideoLoad}
          @error=${this.handleVideoError}
        >
        </video>
        <div class="video-placeholder">
          <svg class="play-icon">
            <use href="#S2IconPlay_20_N"></use>
          </svg>
        </div>
      `;
    }

    if (ext === 'pdf') {
      return `
        <div class="document-placeholder">
          <svg class="document-icon">
            <use href="#S2IconFileConvert_20_N"></use>
          </svg>
        </div>
      `;
    }

    return `
      <div class="unknown-placeholder">
        <svg class="unknown-icon">
          <use href="#S2_Icon_FileConvert_20_N"></use>
        </svg>
      </div>
    `;
  }

  handleMediaClick(e) {
    const { path } = e.currentTarget.dataset;
    const media = this.mediaData.find((m) => m.url === path || m.mediaUrl === path);
    this.dispatchEvent(new CustomEvent('mediaClick', { detail: { media } }));
  }

  handleInfoClick(e, media) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('mediaInfo', { detail: { media } }));
  }

  handleUsageClick(e, media) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('mediaInfo', { detail: { media } }));
  }

  handlePreviewClick(e, media) {
    e.stopPropagation();
    navigator.clipboard.writeText(media.mediaUrl).then(() => {
    }).catch((err) => {
      console.error('Failed to copy URL:', err);
    });
  }

  handleImageError(e) {
    const img = e.target;
    img.style.display = 'none';

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-placeholder';
    errorDiv.innerHTML = `
      <div class="error-content">
        <span class="error-text">404</span>
        <span class="error-label">Not Found</span>
      </div>
    `;

    img.parentNode.appendChild(errorDiv);
  }

  handleVideoLoad(e) {
    const video = e.target;
    const placeholder = video.nextElementSibling;
    if (placeholder && placeholder.classList.contains('video-placeholder')) {
      placeholder.style.display = 'none';
    }
  }

  handleVideoError(e) {
    const video = e.target;
    video.style.display = 'none';
    const placeholder = video.nextElementSibling;
    if (placeholder && placeholder.classList.contains('video-placeholder')) {
      placeholder.style.display = 'flex';
    }
  }

  render() {
    if (!this.mediaData || this.mediaData.length === 0) {
      if (this.isScanning) {
        return html`
          <div class="empty-state">
            <h2>Scanning in progress...</h2>
            <p>Please wait while we discover media files on your site.</p>
          </div>
        `;
      }
      return html`
        <div class="empty-state">
          <h2>No Results Found</h2>
          <p>Try adjusting your filters or search criteria.</p>
        </div>
      `;
    }

    const visibleItems = this.mediaData.slice(this._visibleStart, this._visibleEnd);
    const totalHeight = this.mediaData.length * this._itemHeight;

    return html`
      <main class="list-main">
        <div class="list-header">
          <div class="header-cell">Preview</div>
          <div class="header-cell">Name</div>
          <div class="header-cell">Type</div>
          <div class="header-cell">Usage</div>
          <div class="header-cell">Alt</div>
          <div class="header-cell">Media Info</div>
        </div>
        
        <div class="list-content">
          <div class="list-grid" style="height:${totalHeight}px;">
            ${visibleItems.map((media, i) => {
    const idx = this._visibleStart + i;
    const top = idx * this._itemHeight;

    this._renderedItems.add(idx);

    return html`
                <div class="media-item" data-path="${media.mediaUrl}" data-index="${idx}" @click=${(e) => this.handleMediaClick(e)} style="top:${top}px;">
                  <div class="item-preview clickable" @click=${(e) => this.handlePreviewClick(e, media)} title="Click to copy media URL">
                    ${this.renderMediaPreview(media)}
                  </div>
                  <div class="item-name">${this.getMediaName(media)}</div>
                  <div class="item-type">${getDisplayMediaType(media)}</div>
                  <div class="item-usage">
                    <span class="usage-badge used clickable" @click=${(e) => this.handleUsageClick(e, media)} title="View usage details">Usage (${media.usageCount || 0})</span>
                  </div>
                  <div class="item-alt">
                    ${this.renderAltStatus(media)}
                  </div>
                  <div class="item-actions">
                    <sl-button variant="primary" size="small" @click=${(e) => this.handleInfoClick(e, media)} title="View details">
                      INFO
                    </sl-button>
                  </div>
                </div>
              `;
  })}
          </div>
        </div>
      </main>
    `;
  }

  renderAltStatus(media) {
    if (!media.alt && media.type && media.type.startsWith('img >')) {
      return html`
        <span class="missing-alt-indicator clickable" @click=${(e) => this.handleUsageClick(e, media)} title="View usage details">
          NO ALT
        </span>
      `;
    }
    return html`<span class="alt-present">✓</span>`;
  }

  renderMediaPreview(media) {
    const ext = media.mediaUrl.split('.').pop()?.toLowerCase();

    if (this.isImage(media.mediaUrl)) {
      const imageUrl = media.mediaUrl;
      return html`
        <img src="${imageUrl}" alt="${media.alt || ''}" loading="lazy" @error=${(e) => this.handleImageError(e)}>
      `;
    }

    if (ext === 'mp4') {
      return html`
        <video 
          src="${media.mediaUrl}" 
          preload="metadata"
          muted
          @loadedmetadata=${(e) => this.handleVideoLoad(e)}
          @error=${(e) => this.handleVideoError(e)}
        >
        </video>
        <div class="video-placeholder">
          <svg class="play-icon">
            <use href="#S2IconPlay_20_N"></use>
          </svg>
        </div>
      `;
    }

    if (ext === 'pdf') {
      return html`
        <div class="document-placeholder">
          <svg class="document-icon">
            <use href="#S2IconFileConvert_20_N"></use>
          </svg>
        </div>
      `;
    }

    return html`
      <div class="unknown-placeholder">
        <svg class="unknown-icon">
          <use href="#S2_Icon_FileConvert_20_N"></use>
        </svg>
      </div>
    `;
  }

  getMediaName(media) {
    return media.mediaName || media.mediaUrl.split('/').pop() || 'Unknown';
  }

  isImage(mediaUrl) {
    const ext = mediaUrl.split('.').pop()?.toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
  }
}

customElements.define('nx-media-list', NxMediaList);
