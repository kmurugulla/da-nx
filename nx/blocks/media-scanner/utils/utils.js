import { crawl } from '../../../public/utils/tree.js';
import { daFetch } from '../../../utils/daFetch.js';

export default async function runDiscovery(path, updateTotal) {
  let pageTotal = 0;
  let mediaTotal = 0;
  const callback = async (item) => {
    // Die if not a document
    if (!item.path.endsWith('.html')) return;

    // Fetch the doc & convert to DOM
    const resp = await daFetch(`https://admin.da.live/source${item.path}`);
    if (!resp.ok) {
      console.log('Could not fetch item');
      return;
    }

    pageTotal += 1;
    updateTotal('page', pageTotal);
    const text = await resp.text();
    const dom = new DOMParser().parseFromString(text, 'text/html');

    const imgs = dom.querySelectorAll('img');
    mediaTotal += imgs.length;
    updateTotal('media', mediaTotal);
  };

  const { results, getDuration } = crawl({ path, callback });
  await results;
  console.log('finished');
  console.log(getDuration());
}