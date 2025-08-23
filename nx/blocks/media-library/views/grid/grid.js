import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { IMAGE_EXTENSIONS, getDisplayMediaType } from '../../utils/types.js';
import { getVideoThumbnail, isVideoUrl } from '../../utils/video.js';

const styles = await getStyle(import.meta.url);

class NxMediaGrid extends LitElement {
  static properties = {
    mediaData: { attribute: false },
    sitePath: { attribute: false },
    isScanning: { attribute: false },
    _visibleStart: { state: true },
    _visibleEnd: { state: true },
    _itemWidth: { state: true },
    _itemHeight: { state: true },
    _colCount: { state: true },
    _imageErrors: { state: true },
  };

  constructor() {
    super();
    this._visibleStart = 0;
    this._visibleEnd = 20;
    this._itemWidth = 400;
    this._itemHeight = 360;
    this._cardSpacing = 32;
    this._colCount = 4;
    this._scrollTimeout = null;
    this._bufferSize = 3;
    this._renderedCards = new Set();
    this._imageErrors = new Set();
    this._previousMediaDataLength = 0;
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
  }

  firstUpdated() {
    window.addEventListener('resize', () => this.updateColCount());
  }

  updated(changedProperties) {
    if (changedProperties.has('mediaData') && this.mediaData && this.mediaData.length > 0) {
      this.updateComplete.then(() => {
        this._container = this.shadowRoot.querySelector('.media-main');

        if (this._container && !this._scrollListenerAttached) {
          this._container.addEventListener('scroll', () => this.onScroll());
          this._scrollListenerAttached = true;
        }

        // Reset scroll position when data changes (not initial load)
        if (this._container && this._previousMediaDataLength > 0) {
          this.updateColCount();
          this._container.scrollTop = 0;
        }

        // Force container to recalculate its scroll height AFTER grid content is rendered
        requestAnimationFrame(() => {
          this.forceContainerHeightRecalculation();
        });

        // Render initial cards after data change
        this.renderInitialCards();

        // Let LitElement handle DOM updates automatically
        this._previousMediaDataLength = this.mediaData.length;
      });
    }
  }

  shouldUpdate(changedProperties) {
    if (changedProperties.has('mediaData')) {
      // Reset virtual scroll state when data changes
      this._visibleStart = 0;
      this._visibleEnd = Math.min(20, this.mediaData?.length || 0);
      this._renderedCards.clear();
      this._imageErrors.clear();

      // Clear all existing cards from DOM when data changes
      this.clearAllCards();

      // Note: DOM cleanup will happen in updated() after render
      return true;
    }

    // Disable LitElement re-rendering for scroll changes - use manual DOM manipulation instead
    // Only allow re-renders for mediaData changes and column count changes
    return changedProperties.has('_colCount') || changedProperties.has('_imageErrors');
  }

  updateColCount() {
    if (!this._container) return;
    const width = this._container.clientWidth;
    if (width === 0) return;
    this._colCount = Math.max(1, Math.floor(width / (this._itemWidth + this._cardSpacing)));
  }

  forceContainerHeightRecalculation() {
    if (!this._container) return;
    const gridElement = this.shadowRoot.querySelector('.media-grid');
    if (gridElement) {
      gridElement.offsetHeight; // eslint-disable-line no-unused-expressions
      const originalOverflow = this._container.style.overflow;
      this._container.style.overflow = 'hidden';
      this._container.offsetHeight; // eslint-disable-line no-unused-expressions
      this._container.style.overflow = originalOverflow;
    }
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
    const rowHeight = this._itemHeight + this._cardSpacing;
    const startRow = Math.floor(scrollTop / rowHeight);
    const endRow = Math.ceil((scrollTop + this._container.clientHeight) / rowHeight);

    const bufferStartRow = Math.max(0, startRow - this._bufferSize);
    const bufferEndRow = Math.min(
      Math.ceil(this.mediaData.length / this._colCount),
      endRow + this._bufferSize,
    );

    const newStart = bufferStartRow * this._colCount;
    const newEnd = Math.min(bufferEndRow * this._colCount, this.mediaData.length);

    if (newStart !== this._visibleStart || newEnd !== this._visibleEnd) {
      const oldStart = this._visibleStart;
      const oldEnd = this._visibleEnd;

      this._visibleStart = newStart;
      this._visibleEnd = newEnd;

      this.updateCardsIncremental(oldStart, oldEnd, newStart, newEnd);
    }
  }

  clearAllCards() {
    const container = this.shadowRoot.querySelector('.media-grid');
    if (!container) return;

    // Remove all existing cards
    const existingCards = container.querySelectorAll('.media-card');
    existingCards.forEach((card) => {
      card.remove();
    });

    // Clear the rendered cards tracking
    this._renderedCards.clear();
  }

  renderInitialCards() {
    if (!this.mediaData || this.mediaData.length === 0) return;

    const container = this.shadowRoot.querySelector('.media-grid');
    if (!container) return;

    // Render the initial visible range
    const initialItems = this.mediaData.slice(this._visibleStart, this._visibleEnd);

    initialItems.forEach((media, i) => {
      const cardIndex = this._visibleStart + i;
      const cardElement = this.createCardElement(media, cardIndex);
      container.appendChild(cardElement);
      this._renderedCards.add(cardIndex);
    });
  }

  updateCardsIncremental(oldStart, oldEnd, newStart, newEnd) {
    const cardsToAdd = [];
    const cardsToRemove = [];

    // Find cards to add
    for (let i = newStart; i < newEnd; i += 1) {
      if (!this._renderedCards.has(i)) {
        cardsToAdd.push(i);
      }
    }

    // Find cards to remove
    for (let i = oldStart; i < oldEnd; i += 1) {
      if (i < newStart || i >= newEnd) {
        cardsToRemove.push(i);
        this._renderedCards.delete(i);
      }
    }

    if (cardsToAdd.length > 0 || cardsToRemove.length > 0) {
      this.performIncrementalDOMUpdate(cardsToAdd, cardsToRemove);
    }
  }

  performIncrementalDOMUpdate(cardsToAdd, cardsToRemove) {
    const container = this.shadowRoot.querySelector('.media-grid');
    if (!container) {
      return;
    }

    // Remove cards that are no longer visible
    cardsToRemove.forEach((cardIndex) => {
      const cardElement = container.querySelector(`[data-index="${cardIndex}"]`);
      if (cardElement) {
        cardElement.remove();
      }
    });

    // Add new cards
    cardsToAdd.forEach((cardIndex) => {
      const media = this.mediaData[cardIndex];
      if (!media) {
        return;
      }

      const cardElement = this.createCardElement(media, cardIndex);
      container.appendChild(cardElement);
      this._renderedCards.add(cardIndex);
    });

    // Force container height recalculation after DOM changes
    this.forceContainerHeightRecalculation();
  }

  createCardElement(media, cardIndex) {
    // Calculate position based on the card's absolute position in the grid
    // This ensures each card gets its correct position regardless of visible range
    const row = Math.floor(cardIndex / this._colCount);
    const col = cardIndex % this._colCount;
    const top = row * (this._itemHeight + this._cardSpacing);
    const left = col * (this._itemWidth + this._cardSpacing);

    const cardElement = document.createElement('div');
    cardElement.className = 'media-card';
    cardElement.dataset.path = media.url;
    cardElement.dataset.index = cardIndex;
    cardElement.style.cssText = `top:${top}px; left:${left}px; width:${this._itemWidth}px; height:${this._itemHeight}px;`;

    cardElement.addEventListener('click', this.handleMediaClick.bind(this));

    // Create preview div
    const previewDiv = document.createElement('div');
    previewDiv.className = 'media-preview';
    previewDiv.innerHTML = this.getMediaPreviewHTML(media, cardIndex);
    cardElement.appendChild(previewDiv);

    // Create info div
    const infoDiv = document.createElement('div');
    infoDiv.className = 'media-info';
    infoDiv.innerHTML = `
      <h3 class="media-name">${this.getMediaName(media)}</h3>
      <div class="media-meta">
        <span class="media-type">${getDisplayMediaType(media)}</span>
        <span class="media-used clickable" title="View usage details">Usage (${media.usageCount || 0})</span>
        <div class="media-actions">
          <sl-button variant="primary" size="small" title="View details">INFO</sl-button>
          ${this.getMissingAltIndicatorHTML(media)}
        </div>
      </div>
    `;
    cardElement.appendChild(infoDiv);

    // Add event listeners
    const infoButton = infoDiv.querySelector('sl-button');
    if (infoButton) {
      infoButton.addEventListener('click', (e) => this.handleInfoClick(e, media));
    }

    const usageSpan = infoDiv.querySelector('.media-used');
    if (usageSpan) {
      usageSpan.addEventListener('click', (e) => this.handleUsageClick(e, media));
    }

    const noAltSpan = infoDiv.querySelector('.missing-alt-indicator');
    if (noAltSpan) {
      noAltSpan.addEventListener('click', (e) => this.handleUsageClick(e, media));
    }

    return cardElement;
  }

  getMediaPreviewHTML(media, cardIndex) {
    const ext = this.getFileExtension(media.url);

    if (this.isImage(media.url)) {
      const hasError = this._imageErrors.has(cardIndex.toString());
      if (hasError) {
        return `
          <div class="error-placeholder">
            <div class="error-content">
              <span class="error-text">404</span>
              <span class="error-label">Not Found</span>
            </div>
          </div>
        `;
      }
      const optimizedUrl = media.url.replace('format=jpeg', 'format=webply').replace('format=png', 'format=webply');
      return `<img src="${optimizedUrl}" alt="${media.alt || ''}" loading="lazy">`;
    }

    if (isVideoUrl(media.url)) {
      const thumbnailUrl = getVideoThumbnail(media.url);
      if (thumbnailUrl) {
        return `
          <div class="video-preview-container">
            <img src="${thumbnailUrl}" alt="Video thumbnail" class="video-thumbnail" loading="lazy">
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
      return `
        <div class="video-preview-container">
          <div class="video-preview-background">
            <svg class="video-icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_Play_20_N"></use>
            </svg>
            <div class="video-info">
              <span class="video-name">${this.getFileName(media.url)}</span>
              <span class="video-type">Video File</span>
            </div>
          </div>
        </div>
      `;
    }

    if (ext === 'pdf') {
      return `
        <div class="pdf-preview-container">
          <div class="pdf-preview-background">
            <svg class="pdf-icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_FileConvert_20_N"></use>
            </svg>
            <div class="pdf-info">
              <span class="pdf-name">${this.getFileName(media.url)}</span>
              <span class="pdf-type">PDF Document</span>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="unknown-placeholder">
        <svg class="unknown-icon" viewBox="0 0 20 20">
          <use href="#S2IconHome20N-icon"></use>
        </svg>
      </div>
    `;
  }

  getMissingAltIndicatorHTML(media) {
    if (!media.alt && this.isImage(media.url)) {
      return '<span class="missing-alt-indicator clickable" title="View usage details">NO ALT</span>';
    }
    return '';
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

  render() {
    return html`
      <main class="media-main">
        ${this.renderMainContent()}
      </main>
    `;
  }

  renderMainContent() {
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

    const totalRows = Math.ceil(this.mediaData.length / this._colCount);
    const spacerHeight = totalRows * (this._itemHeight + this._cardSpacing);

    // Only render the initial visible range - let manual DOM manipulation handle the rest
    const initialVisibleItems = this.mediaData.slice(this._visibleStart, this._visibleEnd);

    return html`
      <div class="media-grid" style="height:${spacerHeight}px;">
        ${initialVisibleItems.map((media, i) => {
    const idx = this._visibleStart + i;
    const row = Math.floor(idx / this._colCount);
    const col = idx % this._colCount;
    const top = row * (this._itemHeight + this._cardSpacing);
    const left = col * (this._itemWidth + this._cardSpacing);

    this._renderedCards.add(idx);

    return html`
            <div class="media-card" data-path="${media.url}" data-index="${idx}" @click=${(e) => this.handleMediaClick(e)} style="top:${top}px; left:${left}px; width:${this._itemWidth}px; height:${this._itemHeight}px;">
              <div class="media-preview">
                ${this.renderMediaPreview(media)}
              </div>
              <div class="media-info">
                <h3 class="media-name">${this.getMediaName(media)}</h3>
                <div class="media-meta">
                  <span class="media-type">${getDisplayMediaType(media)}</span>
                  <span class="media-used clickable" @click=${(e) => this.handleUsageClick(e, media)} title="View usage details">Usage (${media.usageCount || 0})</span>
                  <div class="media-actions">
                    <sl-button variant="primary" size="small" @click=${(e) => this.handleInfoClick(e, media)} title="View details">
                      INFO
                    </sl-button>
                    ${this.renderMissingAltIndicator(media)}
                  </div>
                </div>
              </div>
            </div>
          `;
  })}
      </div>
    `;
  }

  renderMissingAltIndicator(media) {
    if (!media.alt && this.isImage(media.url)) {
      return html`
        <span class="missing-alt-indicator clickable" @click=${(e) => this.handleUsageClick(e, media)} title="View usage details">
          NO ALT
        </span>
      `;
    }
    return '';
  }

  renderMediaPreview(media) {
    const ext = this.getFileExtension(media.url);

    if (this.isImage(media.url)) {
      const cardIndex = this._visibleStart + this.mediaData.indexOf(media);
      const hasError = this._imageErrors.has(cardIndex.toString());

      if (hasError) {
        return html`
          <div class="error-placeholder">
            <div class="error-content">
              <span class="error-text">404</span>
              <span class="error-label">Not Found</span>
            </div>
          </div>
        `;
      }

      const optimizedUrl = media.url.replace('format=jpeg', 'format=webply').replace('format=png', 'format=webply');
      return html`
        <img src="${optimizedUrl}" alt="${media.alt || ''}" loading="lazy" @error=${this.handleImageError}>
      `;
    }

    // Check if it's a video URL from supported providers
    if (isVideoUrl(media.url)) {
      const thumbnailUrl = getVideoThumbnail(media.url);
      if (thumbnailUrl) {
        return html`
          <div class="video-preview-container">
            <img src="${thumbnailUrl}" alt="Video thumbnail" class="video-thumbnail" loading="lazy" @error=${this.handleThumbnailError}>
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
          <div class="video-preview-background">
            <svg class="video-icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_Play_20_N"></use>
            </svg>
            <div class="video-info">
              <span class="video-name">${this.getFileName(media.url)}</span>
              <span class="video-type">Video File</span>
            </div>
          </div>
        </div>
      `;
    }

    if (ext === 'pdf') {
      return html`
        <div class="pdf-preview-container">
          <div class="pdf-preview-background">
            <svg class="pdf-icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_FileConvert_20_N"></use>
            </svg>
            <div class="pdf-info">
              <span class="pdf-name">${this.getFileName(media.url)}</span>
              <span class="pdf-type">PDF Document</span>
            </div>
          </div>
        </div>
      `;
    }

    return html`
      <div class="unknown-placeholder">
        <svg class="unknown-icon" viewBox="0 0 20 20">
          <use href="#S2IconHome20N-icon"></use>
        </svg>
      </div>
    `;
  }

  getMediaName(media) {
    return media.name || this.getFileName(media.url) || 'Unknown';
  }

  isImage(mediaUrl) {
    const ext = this.getFileExtension(mediaUrl);
    return IMAGE_EXTENSIONS.includes(ext);
  }

  getFileExtension(url) {
    try {
      const urlObj = new URL(url);
      const { pathname } = urlObj;
      return pathname.split('.').pop()?.toLowerCase() || '';
    } catch {
      return url.split('.').pop()?.toLowerCase() || '';
    }
  }

  getFileName(url) {
    try {
      const urlObj = new URL(url);
      const { pathname } = urlObj;
      return pathname.split('/').pop() || '';
    } catch {
      return url.split('/').pop() || '';
    }
  }

  handleImageError(e) {
    const img = e.target;
    const card = img.closest('.media-card');
    if (card) {
      const cardIndex = card.dataset.index;
      if (cardIndex !== undefined) {
        this._imageErrors.add(cardIndex);
        this.requestUpdate();
      }
    }
  }

  handleThumbnailError(e) {
    const img = e.target;
    const card = img.closest('.media-card');
    if (card) {
      const cardIndex = card.dataset.index;
      if (cardIndex !== undefined) {
        this._imageErrors.add(cardIndex);
        this.requestUpdate();
      }
    }
  }
}

customElements.define('nx-media-grid', NxMediaGrid);
