import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { IMAGE_EXTENSIONS, getDisplayMediaType } from '../../utils/utils.js';

const styles = await getStyle(import.meta.url);

class NxMediaGrid extends LitElement {
  static properties = {
    mediaData: { attribute: false },
    sitePath: { attribute: false },
    isScanning: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
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

    return html`
      <main class="media-main">
        <div class="media-grid">
          ${this.mediaData.map((media) => html`
            <div class="media-card" data-path="${media.url}" @click=${this.handleMediaClick}>
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
                    ${!media.alt && media.type && media.type.startsWith('img >') ? html`
                      <span class="missing-alt-indicator clickable" @click=${(e) => this.handleUsageClick(e, media)} title="View usage details">
                        NO ALT
                      </span>
                    ` : ''}
                  </div>
                </div>
              </div>
            </div>
          `)}
        </div>
      </main>
    `;
  }

  renderMediaPreview(media) {
    const ext = this.getFileExtension(media.url);

    if (this.isImage(media.url)) {
      return html`
        <img src="${media.url}" alt="${media.alt || ''}" loading="lazy" @error=${this.handleImageError}>
      `;
    }

    if (ext === 'mp4') {
      return html`
        <video 
          src="${media.url}" 
          preload="metadata"
          muted
          @loadedmetadata=${this.handleVideoLoad}
          @error=${this.handleVideoError}
        >
        </video>
        <div class="video-placeholder">
          <svg class="play-icon" viewBox="0 0 20 20">
            <use href="#S2_Icon_Play_20_N"></use>
          </svg>
        </div>
      `;
    }

    if (ext === 'pdf') {
      return html`
        <iframe 
          src="${media.url}#toolbar=0&navpanes=0&scrollbar=0" 
          class="pdf-preview"
          @load=${this.handlePdfLoad}
          @error=${this.handlePdfError}
        >
        </iframe>
        <div class="document-placeholder">
          <svg class="document-icon" viewBox="0 0 20 20">
            <use href="#S2_Icon_FileConvert_20_N"></use>
          </svg>
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
    // Show placeholder for broken images
    const card = img.closest('.media-card');
    if (card) {
      const placeholder = card.querySelector('.unknown-placeholder');
      if (placeholder) {
        placeholder.style.display = 'flex';
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

  handlePdfLoad(e) {
    const iframe = e.target;
    const placeholder = iframe.nextElementSibling;
    if (placeholder && placeholder.classList.contains('document-placeholder')) {
      placeholder.style.display = 'none';
    }
  }

  handlePdfError(e) {
    const iframe = e.target;
    iframe.style.display = 'none';
    const placeholder = iframe.nextElementSibling;
    if (placeholder && placeholder.classList.contains('document-placeholder')) {
      placeholder.style.display = 'flex';
    }
  }
}

customElements.define('nx-media-grid', NxMediaGrid);
