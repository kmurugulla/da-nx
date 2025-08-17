import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { DA_ORIGIN } from '../../../../public/utils/constants.js';

const styles = await getStyle(import.meta.url);

class NxMediaList extends LitElement {
  static properties = {
    mediaData: { attribute: false },
    sitePath: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  handleMediaClick(e) {
    const { path } = e.currentTarget.dataset;
    this.dispatchEvent(new CustomEvent('mediaClick', {
      detail: { mediaPath: path },
    }));
  }

  get orgRepo() {
    if (!this.sitePath) return { org: '', repo: '' };
    const parts = this.sitePath.split('/').filter(Boolean);
    return {
      org: parts[0] || '',
      repo: parts[1] || '',
    };
  }

  render() {
    if (!this.mediaData || this.mediaData.length === 0) {
      return html`
        <div class="empty-state">
          <h2>No media found</h2>
          <p>Start scanning your site to discover media files.</p>
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
          <div class="header-cell">Location</div>
          <div class="header-cell">Status</div>
        </div>
        
        <div class="list-content">
          ${this.mediaData.map((media) => html`
            <div class="media-item" data-path="${media.mediaPath}" @click=${this.handleMediaClick}>
              <div class="item-preview">
                ${this.renderMediaPreview(media)}
              </div>
              <div class="item-name">${this.getMediaName(media)}</div>
              <div class="item-type">${this.getMediaType(media.mediaPath)}</div>
              <div class="item-usage">
                ${media.usageCount > 0 ? html`
                  <span class="usage-badge used">Used (${media.usageCount})</span>
                ` : html`
                  <span class="usage-badge unused">Unused</span>
                `}
              </div>
              <div class="item-location">
                ${media.docPath ? this.getShortPath(media.docPath) : '-'}
              </div>
              <div class="item-status">
                ${!media.alt && this.isImage(media.mediaPath) ? html`
                  <span class="status-badge missing">Missing alt text</span>
                ` : html`
                  <span class="status-badge present">Alt text present</span>
                `}
              </div>
            </div>
          `)}
        </div>
      </main>
    `;
  }

  renderMediaPreview(media) {
    const ext = media.mediaPath.split('.').pop()?.toLowerCase();
    const { org, repo } = this.orgRepo;
    
    if (this.isImage(media.mediaPath)) {
      const imageUrl = `${DA_ORIGIN}/source/${org}/${repo}${media.mediaPath}`;
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
          <use href="#S2IconHome20N-icon"></use>
        </svg>
      </div>
    `;
  }

  getMediaName(media) {
    return media.mediaName || media.mediaPath.split('/').pop() || 'Unknown';
  }

  getMediaType(mediaPath) {
    const ext = mediaPath.split('.').pop()?.toLowerCase();
    if (this.isImage(mediaPath)) return 'IMAGE';
    if (ext === 'mp4') return 'VIDEO';
    if (ext === 'pdf') return 'DOCUMENT';
    return 'UNKNOWN';
  }

  isImage(mediaPath) {
    const ext = mediaPath.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
  }

  getShortPath(path) {
    if (!path) return '';
    const parts = path.split('/');
    if (parts.length <= 2) return path;
    return `.../${parts.slice(-2).join('/')}`;
  }
}

customElements.define('nx-media-list', NxMediaList);
