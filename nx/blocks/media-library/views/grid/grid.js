import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { IMAGE_EXTENSIONS, getDisplayMediaType, getVideoThumbnail, isVideoUrl } from '../../utils/utils.js';

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
    _pdfBlobUrls: { state: true },
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
    window.addEventListener('resize', () => this._updateColCount());
  }

  updated(changedProperties) {
    if (changedProperties.has('mediaData') && this.mediaData && this.mediaData.length > 0) {
      this.updateComplete.then(() => {
        this._container = this.shadowRoot.querySelector('.media-main');
        if (this._container && !this._scrollListenerAttached) {
          this._container.addEventListener('scroll', () => this._onScroll());
          this._scrollListenerAttached = true;
          this._updateColCount();
        }
      });
    }
  }

  shouldUpdate(changedProperties) {
    if (changedProperties.has('mediaData')) {
      this._visibleStart = 0;
      this._visibleEnd = Math.min(20, this.mediaData?.length || 0);
      this._renderedCards.clear();
      return true;
    }

    if (changedProperties.has('_visibleStart') || changedProperties.has('_visibleEnd')) {
      return false;
    }

    return changedProperties.has('_colCount');
  }

  _updateColCount() {
    if (!this._container) return;
    const width = this._container.clientWidth;
    if (width === 0) return;
    this._colCount = Math.max(1, Math.floor(width / (this._itemWidth + this._cardSpacing)));
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

    const rowHeight = this._itemHeight + this._cardSpacing;
    const startRow = Math.floor(scrollTop / rowHeight);
    const endRow = Math.ceil(scrollBottom / rowHeight);

    const bufferStartRow = Math.max(0, startRow - this._bufferSize);
    const bufferEndRow = Math.min(
      Math.ceil(this.mediaData.length / this._colCount),
      endRow + this._bufferSize,
    );

    const newStart = bufferStartRow * this._colCount;
    const newEnd = Math.min(bufferEndRow * this._colCount, this.mediaData.length);

    const needsUpdate = this._needsUpdate(newStart, newEnd);

    if (needsUpdate) {
      const oldStart = this._visibleStart;
      const oldEnd = this._visibleEnd;

      this._visibleStart = newStart;
      this._visibleEnd = newEnd;

      this._updateCardsIncremental(oldStart, oldEnd, newStart, newEnd);
    }
  }

  _needsUpdate(newStart, newEnd) {
    for (let i = newStart; i < newEnd; i += 1) {
      if (!this._renderedCards.has(i)) {
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

  _updateCardsIncremental(oldStart, oldEnd, newStart, newEnd) {
    const cardsToAdd = [];

    for (let i = newStart; i < newEnd; i += 1) {
      if (!this._renderedCards.has(i)) {
        cardsToAdd.push(i);
      }
    }

    const cardsToRemove = [];
    for (let i = oldStart; i < Math.min(oldEnd, newStart); i += 1) {
      cardsToRemove.push(i);
      this._renderedCards.delete(i);
    }

    if (cardsToAdd.length > 0 || cardsToRemove.length > 0) {
      this._performIncrementalDOMUpdate(cardsToAdd, cardsToRemove);
    }
  }

  _performIncrementalDOMUpdate(cardsToAdd, cardsToRemove) {
    const container = this.shadowRoot.querySelector('.media-grid');
    if (!container) return;

    cardsToRemove.forEach((cardIndex) => {
      const cardElement = container.querySelector(`[data-index="${cardIndex}"]`);
      if (cardElement) {
        cardElement.remove();
      }
    });

    cardsToAdd.forEach((cardIndex) => {
      const media = this.mediaData[cardIndex];
      if (!media) return;

      const cardElement = this._createCardElement(media, cardIndex);
      container.appendChild(cardElement);

      this._renderedCards.add(cardIndex);
    });
  }

  _createCardElement(media, cardIndex) {
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

    const previewDiv = document.createElement('div');
    previewDiv.className = 'media-preview';

    const ext = this.getFileExtension(media.url);

    if (this.isImage(media.url)) {
      const img = document.createElement('img');
      img.src = media.url.replace('format=jpeg', 'format=webply').replace('format=png', 'format=webply');
      img.alt = media.alt || '';
      img.loading = 'lazy';
      img.addEventListener('error', this.handleImageError);
      previewDiv.appendChild(img);
    } else if (isVideoUrl(media.url)) {
      const thumbnailUrl = getVideoThumbnail(media.url);
      if (thumbnailUrl) {
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-preview-container';
        videoContainer.innerHTML = `
          <img src="${thumbnailUrl}" alt="Video thumbnail" class="video-thumbnail" loading="lazy">
          <div class="video-overlay">
            <svg class="play-icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_Play_20_N"></use>
            </svg>
          </div>
        `;

        const thumbnailImg = videoContainer.querySelector('.video-thumbnail');
        thumbnailImg.addEventListener('error', this.handleThumbnailError);
        previewDiv.appendChild(videoContainer);
      } else {
        // Fallback to icon-based preview
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-preview-container';
        videoContainer.innerHTML = `
          <div class="video-preview-background">
            <svg class="video-icon" viewBox="0 0 20 20">
              <use href="#S2_Icon_Play_20_N"></use>
            </svg>
            <div class="video-info">
              <span class="video-name">${this.getFileName(media.url)}</span>
              <span class="video-type">Video File</span>
            </div>
          </div>
        `;
        previewDiv.appendChild(videoContainer);
      }
    } else if (ext === 'mp4') {
      const videoContainer = document.createElement('div');
      videoContainer.className = 'video-preview-container';
      videoContainer.innerHTML = `
        <div class="video-preview-background">
          <svg class="video-icon" viewBox="0 0 20 20">
            <use href="#S2_Icon_Play_20_N"></use>
          </svg>
          <div class="video-info">
            <span class="video-name">${this.getFileName(media.url)}</span>
            <span class="video-type">Video File</span>
          </div>
        </div>
      `;
      previewDiv.appendChild(videoContainer);
    } else if (ext === 'pdf') {
      const pdfContainer = document.createElement('div');
      pdfContainer.className = 'pdf-preview-container';
      pdfContainer.innerHTML = `
        <div class="pdf-preview-background">
          <svg class="pdf-icon" viewBox="0 0 20 20">
            <use href="#S2_Icon_FileConvert_20_N"></use>
          </svg>
          <div class="pdf-info">
            <span class="pdf-name">${this.getFileName(media.url)}</span>
            <span class="pdf-type">PDF Document</span>
          </div>
        </div>
      `;
      previewDiv.appendChild(pdfContainer);
    } else {
      const unknownPlaceholder = document.createElement('div');
      unknownPlaceholder.className = 'unknown-placeholder';
      unknownPlaceholder.innerHTML = `
        <svg class="unknown-icon" viewBox="0 0 20 20">
          <use href="#S2IconHome20N-icon"></use>
        </svg>
      `;
      previewDiv.appendChild(unknownPlaceholder);
    }

    const infoDiv = document.createElement('div');
    infoDiv.className = 'media-info';
    infoDiv.innerHTML = `
      <h3 class="media-name">${this.getMediaName(media)}</h3>
      <div class="media-meta">
        <span class="media-type">${getDisplayMediaType(media)}</span>
        <span class="media-used clickable" title="View usage details">Usage (${media.usageCount || 0})</span>
        <div class="media-actions">
          <sl-button variant="primary" size="small" title="View details">INFO</sl-button>
          ${!media.alt && this.isImage(media.url) ? '<span class="missing-alt-indicator clickable" title="View usage details">NO ALT</span>' : ''}
        </div>
      </div>
    `;

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

    cardElement.appendChild(previewDiv);
    cardElement.appendChild(infoDiv);

    return cardElement;
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
    if (!this.mediaData || this.mediaData.length === 0) {
      return html`<div class="empty-state">No media files found</div>`;
    }

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

    const visibleItems = this.mediaData.slice(this._visibleStart, this._visibleEnd);
    const totalRows = Math.ceil(this.mediaData.length / this._colCount);
    const spacerHeight = totalRows * (this._itemHeight + this._cardSpacing);

    return html`
      <div class="media-grid" style="height:${spacerHeight}px;">
        ${visibleItems.map((media, i) => {
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
    img.style.display = 'none';

    const card = img.closest('.media-card');
    if (card) {
      const preview = card.querySelector('.media-preview');
      if (preview) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-placeholder';
        errorDiv.innerHTML = `
          <div class="error-content">
            <span class="error-text">404</span>
            <span class="error-label">Not Found</span>
          </div>
        `;
        preview.appendChild(errorDiv);
      }
    }
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

  handleThumbnailError(e) {
    const img = e.target;
    img.style.display = 'none';

    const container = img.closest('.video-preview-container');
    if (container) {
      container.innerHTML = `
        <div class="video-preview-background">
          <svg class="video-icon" viewBox="0 0 20 20">
            <use href="#S2_Icon_Play_20_N"></use>
          </svg>
          <div class="video-info">
            <span class="video-name">${this.getFileName(img.alt || '')}</span>
            <span class="video-type">Video File</span>
          </div>
        </div>
      `;
    }
  }
}

customElements.define('nx-media-grid', NxMediaGrid);
