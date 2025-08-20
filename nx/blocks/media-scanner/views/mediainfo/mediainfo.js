import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  getDisplayMediaType,
  formatFileSize,
  extractMediaLocation,
  groupUsagesByPath,
  getEditUrl,
  getViewUrl,
  updateDocumentAltText,
  EXIF_JS_URL,
} from '../../utils/utils.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import loadScript from '../../../../utils/script.js';

const styles = await getStyle(import.meta.url);

class NxMediaInfo extends LitElement {
  static properties = {
    media: { attribute: false },
    isOpen: { attribute: false },
    org: { attribute: false },
    repo: { attribute: false },
    allMediaData: { attribute: false },
    _activeTab: { state: true },
    _exifData: { state: true },
    _loading: { state: true },
    _fileSize: { state: true },
    _mimeType: { state: true },
    _mediaOrigin: { state: true },
    _mediaPath: { state: true },
    _newAltText: { state: true },
    _usageData: { state: true },
    _usageLoading: { state: true },
    _editingAltUsage: { state: true },
  };

  constructor() {
    super();
    this.isOpen = false;
    this.media = null;
    this._activeTab = 'usage';
    this._exifData = null;
    this._loading = false;
    this._fileSize = null;
    this._mimeType = null;
    this._mediaOrigin = null;
    this._mediaPath = null;
    this._newAltText = '';
    this._usageData = [];
    this._usageLoading = false;
    this._editingAltUsage = null;
    this.allMediaData = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  updated(changedProperties) {
    if (changedProperties.has('media') && this.media) {
      this.loadFileSize();
      if (this.isImage(this.media.url)) {
        this.loadExifData();
      }
      this.loadUsageData();
    }

    if (changedProperties.has('allMediaData') && this.allMediaData && this.media) {
      this.loadUsageData();
    }

    if (changedProperties.has('_activeTab') && this._activeTab === 'usage') {
      this.loadUsageData();
    }
  }

  async loadExifData() {
    if (!this.media || !this.isImage(this.media.url)) return;

    this._loading = true;
    try {
      await loadScript(EXIF_JS_URL);

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        if (typeof window.EXIF !== 'undefined') {
          window.EXIF.getData(img, () => {
            this._exifData = window.EXIF.getAllTags(img);
            this._loading = false;
          });
        } else {
          this._loading = false;
        }
      };

      img.onerror = () => {
        this._loading = false;
      };

      img.src = this.media.url;
    } catch (error) {
      this._loading = false;
    }
  }

  loadUsageData() {
    if (!this.media || !this.media.url || !this.allMediaData) return;

    this._usageLoading = true;
    try {
      const mediaUrl = this.media.url;
      this._usageData = this.allMediaData.filter((item) => item.url === mediaUrl);
    } catch (error) {
      this._usageData = [];
    } finally {
      this._usageLoading = false;
    }
  }

  handleClose() {
    this.dispatchEvent(new CustomEvent('close'));
  }

  handleTabChange(e) {
    const { tab } = e.target.dataset;
    this._activeTab = tab;
  }

  handleAltTextInput(e) {
    this._newAltText = e.target.value;
  }

  editAlt(usage) {
    this._editingAltUsage = usage.doc;
    this._newAltText = '';
  }

  cancelAlt() {
    this._editingAltUsage = null;
    this._newAltText = '';
  }

  async saveAlt(usage) {
    if (!this._newAltText.trim()) return;

    try {
      const { org, repo } = this;

      if (!org || !repo) {
        throw new Error('Missing org or repo information');
      }

      await updateDocumentAltText(
        org,
        repo,
        usage.doc,
        usage.selector,
        this._newAltText,
        daFetch,
        DA_ORIGIN,
      );

      const usageIndex = this._usageData.findIndex((u) => u.doc === usage.doc);
      if (usageIndex !== -1) {
        this._usageData[usageIndex].alt = this._newAltText;
      }

      const savedAltText = this._newAltText;
      this._editingAltUsage = null;
      this._newAltText = '';

      this.dispatchEvent(new CustomEvent('altTextUpdated', {
        detail: {
          media: this.media,
          usage,
          newAltText: savedAltText,
        },
      }));
    } catch (error) {
      // Silent error handling
    }
  }

  handleEditDocument(docPath) {
    if (!docPath) return;

    const { org, repo } = this;

    if (!org || !repo) {
      return;
    }

    const editUrl = getEditUrl(org, repo, docPath);
    if (editUrl) {
      window.open(editUrl, '_blank');
    }
  }

  handleViewDocument(docPath) {
    if (!docPath) return;

    const { org, repo } = this;

    if (!org || !repo) {
      return;
    }

    const viewUrl = getViewUrl(org, repo, docPath);
    if (viewUrl) {
      window.open(viewUrl, '_blank');
    }
  }

  isImage(url) {
    const ext = url.split('.').pop()?.toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
  }

  isVideo(url) {
    const ext = url.split('.').pop()?.toLowerCase();
    return VIDEO_EXTENSIONS.includes(ext);
  }

  async loadFileSize() {
    if (!this.media || !this.media.url) return;

    try {
      const response = await fetch(this.media.url, { method: 'HEAD' });
      if (response.ok) {
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          this._fileSize = formatFileSize(parseInt(contentLength, 10));
        } else {
          this._fileSize = 'Unknown';
        }

        const contentType = response.headers.get('content-type');
        if (contentType) {
          const [mimeType] = contentType.split(';');
          this._mimeType = mimeType;
        } else {
          this._mimeType = 'Unknown';
        }

        const { origin, path } = extractMediaLocation(this.media.url);
        this._mediaOrigin = origin;
        this._mediaPath = path;
      } else {
        this._fileSize = 'Unknown';
        this._mimeType = 'Unknown';
        this._mediaOrigin = 'Unknown';
        this._mediaPath = 'Unknown';
      }
    } catch (error) {
      this._fileSize = 'Unknown';
      this._mimeType = 'Unknown';
      this._mediaOrigin = 'Unknown';
      this._mediaPath = 'Unknown';
    }
  }

  getFileType() {
    return getDisplayMediaType(this.media);
  }

  renderUsageGroup(docPath, usages) {
    return html`
      <div class="usage-group">
        <div class="usage-group-header">
          <h4 class="document-path">${docPath}</h4>
          <span class="usage-count">${usages.length} usage${usages.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="usage-table-container">
          <table class="usage-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Alt</th>
                <th>Context</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${usages.map((usage) => this.renderUsageTableRow(usage))}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderMediaPreview() {
    if (this.isImage(this.media.url)) {
      return html`
        <img src="${this.media.url}" alt="${this.media.alt || ''}" class="preview-image">
      `;
    }
    if (this.isVideo(this.media.url)) {
      return html`
        <video src="${this.media.url}" controls class="preview-video">
          Your browser does not support the video tag.
        </video>
      `;
    }
    return html`
      <div class="preview-placeholder">
        <svg class="document-icon">
          <use href="#S2IconFileConvert_20_N"></use>
        </svg>
      </div>
    `;
  }

  renderExifSection() {
    if (this.isImage(this.media.url)) {
      if (this._loading) {
        return html`<div class="loading">Loading EXIF data...</div>`;
      }

      if (this._exifData && Object.keys(this._exifData).length > 0) {
        return html`
          <div class="exif-section">
            <h4>EXIF Data</h4>
            <div class="exif-table">
              ${Object.entries(this._exifData).map(([key, value]) => html`
                <div class="exif-row">
                  <span class="exif-label">${key}:</span>
                  <span class="exif-value">${value}</span>
                </div>
              `)}
            </div>
          </div>
        `;
      }

      return html`
        <div class="exif-section">
          <h4>EXIF Data</h4>
          <div class="exif-table">
            <div class="exif-row no-data">
              <span class="exif-value">No data available</span>
            </div>
          </div>
        </div>
      `;
    }
    return '';
  }

  renderUsageTableRow(usage) {
    const isMissingAlt = !usage.alt && usage.type && usage.type.startsWith('img >');
    const isEditingAlt = this._editingAltUsage === usage.doc;

    return html`
      <tr class="usage-row">
        <td class="type-cell">
          <span class="type-badge">${getDisplayMediaType(usage)}</span>
        </td>
        <td class="alt-cell">
          ${this.renderAltCell(usage, isEditingAlt, isMissingAlt)}
        </td>
        <td class="context-cell">
          ${this.renderContextCell(usage)}
        </td>
        <td class="actions-cell">
          ${this.renderActionsCell(usage)}
        </td>
      </tr>
    `;
  }

  renderAltCell(usage, isEditingAlt, isMissingAlt) {
    if (isEditingAlt) {
      return html`
        <div class="alt-edit-form">
          <sl-input 
            type="text" 
            placeholder="Enter alt text..."
            .value=${this._newAltText}
            @input=${this.handleAltTextInput}
            size="small"
          ></sl-input>
          <div class="alt-edit-actions">
            <sl-button type="button" size="small" class="accent" @click=${() => this.saveAlt(usage)}>
              Save
            </sl-button>
            <sl-button type="button" size="small" class="negative" @click=${this.cancelAlt}>
              Cancel
            </sl-button>
          </div>
        </div>
      `;
    }

    if (usage.alt) {
      return html`<span class="alt-text">${usage.alt}</span>`;
    }

    if (isMissingAlt) {
      return html`
        <div class="alt-missing">
          <span class="alt-warning-badge">Missing</span>
          <sl-button type="button" size="small" class="primary" @click=${() => this.editAlt(usage)}>
            Add Alt
          </sl-button>
        </div>
      `;
    }

    return html`<span class="alt-none">-</span>`;
  }

  renderContextCell(usage) {
    if (usage.ctx) {
      return html`<div class="context-text">${usage.ctx}</div>`;
    }
    return html`<span class="context-none">-</span>`;
  }

  renderActionsCell(usage) {
    if (usage.doc) {
      return html`
        <div class="actions-container">
          <sl-button type="button" size="small" class="primary" @click=${() => this.handleViewDocument(usage.doc)} title="View document">
           Preview
          </sl-button>
          <sl-button type="button" size="small" class="primary" @click=${() => this.handleEditDocument(usage.doc)} title="Edit document">
            Edit
          </sl-button>
        </div>
      `;
    }
    return html`<span class="no-actions">-</span>`;
  }

  renderInfoTab() {
    return html`
      <div class="tab-content">
        <div class="metadata-section">
          <h3>Metadata</h3>
          
          <div class="metadata-table-container">
            <table class="metadata-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr class="metadata-row">
                  <td class="metadata-label">File Type</td>
                  <td class="metadata-value">${this.getFileType()}</td>
                </tr>
                <tr class="metadata-row">
                  <td class="metadata-label">MIME Type</td>
                  <td class="metadata-value">${this._mimeType || 'Loading...'}</td>
                </tr>
                <tr class="metadata-row">
                  <td class="metadata-label">File Size</td>
                  <td class="metadata-value">${this._fileSize || 'Loading...'}</td>
                </tr>
                <tr class="metadata-row">
                  <td class="metadata-label">Media Origin</td>
                  <td class="metadata-value">${this._mediaOrigin || 'Loading...'}</td>
                </tr>
                <tr class="metadata-row">
                  <td class="metadata-label">Media Path</td>
                  <td class="metadata-value">${this._mediaPath || 'Loading...'}</td>
                </tr>
                <tr class="metadata-row">
                  <td class="metadata-label">Usage Count</td>
                  <td class="metadata-value">${this.media.usageCount || 0}</td>
                </tr>
              </tbody>
            </table>
          </div>

          ${this.renderExifSection()}
        </div>
      </div>
    `;
  }

  renderUsageContent() {
    if (this._usageLoading) {
      return html`
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Loading usage details...</p>
        </div>
      `;
    }

    if (this._usageData.length > 0) {
      const groupedUsages = groupUsagesByPath(this._usageData);
      return html`
        <div class="usage-list">
          ${Object.entries(groupedUsages).map(([docPath, usages]) => this.renderUsageGroup(docPath, usages))}
        </div>
      `;
    }

    return html`
      <div class="no-usage">
        <p>No usage details found for this media file.</p>
      </div>
    `;
  }

  renderUsageTab() {
    return html`
      <div class="tab-content">
        <div class="usage-summary">
          <p class="usage-count">Found in ${this._usageData.length} location${this._usageData.length !== 1 ? 's' : ''}</p>
        </div>

        ${this.renderUsageContent()}
      </div>
    `;
  }

  render() {
    if (!this.isOpen || !this.media) return '';

    return html`
      <div class="modal-overlay" @click=${this.handleClose}>
        <div class="modal-content" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h2>${this.media.name || 'Media Details'}</h2>
            <sl-button type="button" size="small" class="primary outline" @click=${this.handleClose} title="Close">
              Close
            </sl-button>
          </div>

          <div class="media-preview-section">
            ${this.renderMediaPreview()}
          </div>

          <div class="modal-tabs">
            <button 
              type="button"
              class="tab-btn ${this._activeTab === 'usage' ? 'active' : ''}"
              data-tab="usage"
              @click=${this.handleTabChange}
            >
              Usage (${this.media.usageCount || 0})
            </button>
            <button 
              type="button"
              class="tab-btn ${this._activeTab === 'metadata' ? 'active' : ''}"
              data-tab="metadata"
              @click=${this.handleTabChange}
            >
              Metadata
            </button>
          </div>

          <div class="modal-body">
            ${this._activeTab === 'usage' ? this.renderUsageTab() : this.renderInfoTab()}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-media-info', NxMediaInfo);
