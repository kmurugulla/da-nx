import { html, LitElement, nothing } from 'da-lit';
import getStyle from '../../utils/styles.js';
import runDiscovery from './utils/utils.js';
import '../../public/sl/components.js';

const EL_NAME = 'nx-media-scanner';

// Styles
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

class NxMediaScanner extends LitElement {
  static properties = {
    sitePath: { attribute: false },
    _error: { state: true },
    _sitePathError: { state: true },
    _pageTotal: { state: true },
    _mediaTotal: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
  }

  update(props) {
    if (props.has('sitePath') && this.sitePath) this.crawlTree();
    super.update();
  }

  async crawlTree() {
    console.log(`Crawling tree for ${this.sitePath}`);
    const updateTotal = (type, count) => {
      if (type === 'page') this._pageTotal = count;
      if (type === 'media') this._mediaTotal = count;
    };
    runDiscovery(this.sitePath, updateTotal);
  }

  handleSetSite(e) {
    e.preventDefault();
    window.location.hash = this._siteInput.value;
  }

  get _siteInput() {
    return this.shadowRoot.querySelector('sl-input[name="site"]');
  }

  render() {
    return html`
      <h1>Media Scanner</h1>
      <form class="nx-site-path" @submit=${this.handleSetSite}>
        <sl-input
          type="text"
          name="site"
          placeholder="/my-org/my-site"
          .value="${this.sitePath || ''}"
          error=${this._sitePathError || nothing}>
        </sl-input>
        <sl-button class="accent" @click=${this.handleSetSite}>Scan</sl-button>
      </form>
      <p>Pages: ${this._pageTotal}</p>
      <p>Media: ${this._mediaTotal}</p>
    `;
  }
}

customElements.define(EL_NAME, NxMediaScanner);

function setupMediaScanner(el) {
  let cmp = document.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    el.append(cmp);
  }

  cmp.sitePath = window.location.hash?.replace('#', '');
}

export default function init(el) {
  el.innerHTML = '';
  setupMediaScanner(el);
  window.addEventListener('hashchange', (e) => {
    setupMediaScanner(el, e);
  });
}
