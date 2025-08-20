import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { IMAGE_EXTENSIONS, getDisplayMediaType } from '../../utils/utils.js';

const styles = await getStyle(import.meta.url);

class NxMediaList extends LitElement {
  static properties = {
    mediaData: { attribute: false },
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
          ${this.mediaData.map((media) => html`
            <div class="media-item" data-path="${media.mediaUrl}" @click=${this.handleMediaClick}>
              <div class="item-preview">
                ${this.renderMediaPreview(media)}
              </div>
              <div class="item-name">${this.getMediaName(media)}</div>
              <div class="item-type">${getDisplayMediaType(media)}</div>
              <div class="item-usage">
                ${media.usageCount > 0 ? html`
                  <span class="usage-badge used">Used (${media.usageCount})</span>
                ` : html`
                  <span class="usage-badge unused">Unused</span>
                `}
              </div>
              <div class="item-alt">
                ${!media.alt && media.type && media.type.startsWith('img >') ? html`
                  <span class="missing-alt-indicator" title="Missing alt text">
                    NO ALT
                  </span>
                ` : html`
                  <span class="alt-present">✓</span>
                `}
              </div>
              <div class="item-actions">
                <sl-button variant="primary" size="small" @click=${(e) => this.handleInfoClick(e, media)} title="View details">
                  INFO
                </sl-button>
              </div>
            </div>
          `)}
        </div>
      </main>
    `;
  }

  renderMediaPreview(media) {
    const ext = media.mediaUrl.split('.').pop()?.toLowerCase();

    if (this.isImage(media.mediaUrl)) {
      const imageUrl = media.mediaUrl;
      return html`
        <img src="${imageUrl}" alt="${media.alt || ''}" loading="lazy">
      `;
    }

    if (ext === 'mp4') {
      return html`
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
