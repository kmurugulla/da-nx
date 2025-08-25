import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import { IMAGE_EXTENSIONS, getDisplayMediaType } from '../../utils/types.js';
import { createElement } from '../../utils/utils.js';
import { getVideoThumbnail, isVideoUrl } from '../../utils/video.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);

const ICONS = [
  `${nx}/public/icons/S2_Icon_Video_20_N.svg`,
  `${nx}/public/icons/S2_Icon_PDF_20_N.svg`,
  `${nx}/public/icons/S2_Icon_AlertCircle_18_N.svg`,
  `${nx}/public/icons/S2_Icon_CheckmarkCircle_18_N.svg`,
];

class NxMediaList extends LitElement {
  static properties = {
    mediaData: { attribute: false },
    isScanning: { attribute: false },
    searchQuery: { attribute: false }, // NEW: Add searchQuery property
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
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
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
    window.addEventListener('resize', () => this.updateVisibleRange());
  }

  updated(changedProperties) {
    if (changedProperties.has('mediaData') && this.mediaData && this.mediaData.length > 0) {
      this.updateComplete.then(() => {
        this._container = this.shadowRoot.querySelector('.list-content');
        if (this._container && !this._scrollListenerAttached) {
          this._container.addEventListener('scroll', this.onScroll.bind(this));
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

  onScroll() {
    if (!this._container || !this.mediaData) return;

    if (this._scrollTimeout) {
      clearTimeout(this._scrollTimeout);
    }

    this._scrollTimeout = setTimeout(() => {
      this.updateVisibleRange();
    }, 16);
  }

  updateVisibleRange() {
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

    const needsUpdate = this.needsUpdate(newStart, newEnd);

    if (needsUpdate) {
      const oldStart = this._visibleStart;
      const oldEnd = this._visibleEnd;

      this._visibleStart = newStart;
      this._visibleEnd = newEnd;

      this.updateItemsIncremental(oldStart, oldEnd, newStart, newEnd);
    }
  }

  needsUpdate(newStart, newEnd) {
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

  updateItemsIncremental(oldStart, oldEnd, newStart, newEnd) {
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
      this.performIncrementalDOMUpdate(itemsToAdd, itemsToRemove);
    }
  }

  performIncrementalDOMUpdate(itemsToAdd, itemsToRemove) {
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

      const itemElement = this.createItemElement(media, itemIndex);
      container.appendChild(itemElement);

      this._renderedItems.add(itemIndex);
    });
  }

  // Add highlighting method
  highlightMatch(text, query) {
    if (!query || !text) return text;
    const regex = new RegExp(`(${query})`, 'ig');
    return text.replace(regex, '<mark>$1</mark>');
  }

  createItemElement(media, itemIndex) {
    const top = itemIndex * this._itemHeight;

    const itemElement = createElement('div', {
      className: 'media-item',
                  dataset: { path: media.url, index: itemIndex },
      style: `top:${top}px; height:${this._itemHeight}px;`,
      events: { click: this.handleMediaClick.bind(this) },
    });

    const previewDiv = createElement('div', {
      className: 'item-preview clickable',
      title: 'Click to copy media URL',
      innerHTML: this.renderMediaPreviewHTML(media),
      events: { click: (e) => this.handlePreviewClick(e, media) },
    });

    // Apply highlighting to name
    const highlightedName = this.highlightMatch(this.getMediaName(media), this.searchQuery);
    const nameDiv = createElement('div', {
      className: 'item-name',
      innerHTML: highlightedName, // Use innerHTML instead of textContent
    });

    const typeDiv = createElement('div', {
      className: 'item-type',
      textContent: getDisplayMediaType(media),
    });

    const usageSpan = createElement('span', {
      className: 'media-used clickable',
      title: 'View usage details',
      textContent: `${media.usageCount || 0}`,
      events: { click: (e) => this.handleUsageClick(e, media) },
    });

    const usageDiv = createElement('div', { className: 'item-usage' }, [usageSpan]);

    const altSpan = createElement('span', {
      className: !media.alt && media.type?.startsWith('img >') ? 'missing-alt-indicator clickable' : 'alt-present',
      title: !media.alt && media.type?.startsWith('img >') ? 'View usage details' : '',
      innerHTML: !media.alt && media.type?.startsWith('img >') ? '<svg class="alert-icon" viewBox="0 0 18 18"><use href="#S2_Icon_AlertCircle_18_N"></use></svg>' : '<svg class="checkmark-icon" viewBox="0 0 18 18"><use href="#S2_Icon_CheckmarkCircle_18_N"></use></svg>',
      events: !media.alt && media.type?.startsWith('img >') ? { click: (e) => this.handleUsageClick(e, media) } : {},
    });

    const altDiv = createElement('div', { className: 'item-alt' }, [altSpan]);

    const infoButton = createElement('sl-button', {
      variant: 'primary outline',
      size: 'small',
      title: 'View details',
      textContent: 'INFO',
      events: { click: (e) => this.handleInfoClick(e, media) },
    });

    const actionsDiv = createElement('div', { className: 'item-actions' }, [infoButton]);

    itemElement.append(previewDiv, nameDiv, typeDiv, usageDiv, altDiv, actionsDiv);

    return itemElement;
  }

  renderMediaPreviewHTML(media) {
    const ext = media.url.split('.').pop()?.toLowerCase();

    if (this.isImage(media.url)) {
      const imageUrl = media.url;
      return `<img src="${imageUrl}" alt="${media.alt || ''}" loading="lazy">`;
    }

    if (ext === 'mp4') {
      return `
        <video 
          src="${media.url}" 
          preload="metadata"
          muted
          @loadedmetadata=${this.handleVideoLoad}
          @error=${this.handleVideoError}
        >
        </video>
        <div class="video-placeholder">
          <svg class="play-icon">
            <use href="#S2_Icon_Play_20_N"></use>
          </svg>
        </div>
      `;
    }

    if (ext === 'pdf') {
      return `
        <div class="pdf-preview-container">
          <svg class="pdf-icon" viewBox="0 0 20 20">
            <use href="#S2_Icon_PDF_20_N"></use>
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
    const media = this.mediaData.find((m) => m.url === path);
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
    navigator.clipboard.writeText(media.url).then(() => {
    }).catch((err) => {
      console.error('Failed to copy URL:', err);
    });
  }

  handleImageError(e) {
    const img = e.target;
    img.style.display = 'none';

    const errorDiv = createElement('div', {
      className: 'error-placeholder',
      innerHTML: `
        <div class="error-content">
          <span class="error-text">404</span>
          <span class="error-label">Not Found</span>
        </div>
      `,
    });

    img.parentNode.appendChild(errorDiv);
  }

  handleThumbnailError(e) {
    const img = e.target;
    img.style.display = 'none';

    const container = img.closest('.video-preview-container');
    if (container) {
      container.innerHTML = `
        <svg class="video-icon" viewBox="0 0 20 20">
          <use href="#S2_Icon_Video_20_N"></use>
        </svg>
      `;
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
                <div class="media-item" data-path="${media.url}" data-index="${idx}" @click=${(e) => this.handleMediaClick(e)} style="top:${top}px;">
                  <div class="item-preview clickable" @click=${(e) => this.handlePreviewClick(e, media)} title="Click to copy media URL">
                    ${this.renderMediaPreview(media)}
                  </div>
                  <div class="item-name">${this.getMediaName(media)}</div>
                  <div class="item-type">${getDisplayMediaType(media)}</div>
                  <div class="item-usage">
                    <span class="media-used clickable" @click=${(e) => this.handleUsageClick(e, media)} title="View usage details">${media.usageCount || 0}</span>
                  </div>
                  <div class="item-alt">
                    ${this.renderAltStatus(media)}
                  </div>
                  <div class="item-actions">
                    <sl-button variant="primary outline" size="small" @click=${(e) => this.handleInfoClick(e, media)} title="View details">
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
        <span class="missing-alt-indicator clickable" @click=${(e) => this.handleUsageClick(e, media)} title="Missing alt text">
          <svg class="alert-icon" viewBox="0 0 18 18">
            <use href="#S2_Icon_AlertCircle_18_N"></use>
          </svg>
        </span>
      `;
    }
    return html`
      <span class="alt-present">
        <svg class="checkmark-icon" viewBox="0 0 18 18">
          <use href="#S2_Icon_CheckmarkCircle_18_N"></use>
        </svg>
      </span>
    `;
  }

  renderMediaPreview(media) {
    const ext = media.url.split('.').pop()?.toLowerCase();

    if (this.isImage(media.url)) {
      const imageUrl = media.url;
      return html`
        <img src="${imageUrl}" alt="${media.alt || ''}" loading="lazy" @error=${(e) => this.handleImageError(e)}>
      `;
    }

    // Check if it's a video URL from supported providers
    if (isVideoUrl(media.url)) {
      const thumbnailUrl = getVideoThumbnail(media.url);
      if (thumbnailUrl) {
        return html`
          <div class="video-preview-container">
            <img src="${thumbnailUrl}" alt="Video thumbnail" class="video-thumbnail" loading="lazy" @error=${(e) => this.handleThumbnailError(e)}>
            <div class="video-overlay">
              <svg class="play-icon" viewBox="0 0 20 20">
                <use href="#S2_Icon_Play_20_N"></use>
              </svg>
            </div>
          </div>
        `;
      }
    }

    if (ext === 'mp4') {
      return html`
        <div class="video-preview-container">
          <svg class="video-icon" viewBox="0 0 20 20">
            <use href="#S2_Icon_Video_20_N"></use>
          </svg>
        </div>
      `;
    }

    if (ext === 'pdf') {
      return html`
        <div class="pdf-preview-container">
          <svg class="pdf-icon" viewBox="0 0 20 20">
            <use href="#S2_Icon_PDF_20_N"></use>
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
    return media.mediaName || media.url.split('/').pop() || 'Unknown';
  }

  isImage(mediaUrl) {
    const ext = mediaUrl.split('.').pop()?.toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
  }
}

customElements.define('nx-media-list', NxMediaList);
