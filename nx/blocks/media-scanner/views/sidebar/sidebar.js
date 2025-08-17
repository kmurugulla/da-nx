import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';

const styles = await getStyle(import.meta.url);

class NxMediaSidebar extends LitElement {
  static properties = {
    filters: { attribute: false },
    mediaData: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  handleFilter(e) {
    const filterType = e.target.dataset.filter;
    this.dispatchEvent(new CustomEvent('filter', {
      detail: { type: filterType },
    }));
  }

  get mediaCounts() {
    if (!this.mediaData) return {};

    const counts = {
      total: this.mediaData.length,
      images: 0,
      videos: 0,
      documents: 0,
      used: 0,
      unused: 0,
      missingAlt: 0,
    };

    this.mediaData.forEach((media) => {
      const ext = media.mediaPath.split('.').pop()?.toLowerCase();

      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
        counts.images++;
      } else if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) {
        counts.videos++;
      } else {
        counts.documents++;
      }

      if (media.usageCount > 0) {
        counts.used++;
      } else {
        counts.unused++;
      }

      if (!media.alt && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
        counts.missingAlt++;
      }
    });

    return counts;
  }

  render() {
    const counts = this.mediaCounts;

    return html`
      <aside class="media-sidebar">
        <div class="filter-section">
          <h3>MEDIA TYPES</h3>
          <ul class="filter-list">
            <li>
              <button data-filter="all" @click=${this.handleFilter}>
                <svg class="filter-icon">
                  <use href="#S2IconApps20N-icon"></use>
                </svg>
                All Media
                <span class="count">${counts.total}</span>
              </button>
            </li>
            <li>
              <button data-filter="images" @click=${this.handleFilter}>
                <svg class="filter-icon">
                  <use href="#S2IconHome20N-icon"></use>
                </svg>
                Images
                <span class="count">${counts.images}</span>
              </button>
            </li>
            <li>
              <button data-filter="videos" @click=${this.handleFilter}>
                <svg class="filter-icon">
                  <use href="#S2IconHome20N-icon"></use>
                </svg>
                Videos
                <span class="count">${counts.videos}</span>
              </button>
            </li>
            <li>
              <button data-filter="documents" @click=${this.handleFilter}>
                <svg class="filter-icon">
                  <use href="#S2IconHome20N-icon"></use>
                </svg>
                Documents
                <span class="count">${counts.documents}</span>
              </button>
            </li>
          </ul>
        </div>

        <div class="filter-section">
          <h3>USAGE STATUS</h3>
          <ul class="filter-list">
            <li>
              <button data-filter="used" @click=${this.handleFilter}>
                <svg class="filter-icon">
                  <use href="#S2IconCheckmarkCircleGreen_20_N"></use>
                </svg>
                Used Files
                <span class="count">${counts.used}</span>
              </button>
            </li>
            <li>
              <button data-filter="unused" @click=${this.handleFilter}>
                <svg class="filter-icon">
                  <use href="#S2IconAlertDiamondOrange_20_N"></use>
                </svg>
                Unused Files
                <span class="count">${counts.unused}</span>
              </button>
            </li>
            <li>
              <button data-filter="missingAlt" @click=${this.handleFilter}>
                <svg class="filter-icon">
                  <use href="#S2IconAlertDiamondOrange_20_N"></use>
                </svg>
                Missing Alt Text
                <span class="count">${counts.missingAlt}</span>
              </button>
            </li>
          </ul>
        </div>
      </aside>
    `;
  }
}

customElements.define('nx-media-sidebar', NxMediaSidebar);
