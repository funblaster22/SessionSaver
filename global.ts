/** @typedef {{name: string, short_name: string, color: 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan', id: number, index: number}} tabGroup */

/** @return {Promise<browser.bookmarks.BookmarkTreeNode>} */
export async function getBookmarkRoot() {
  const ID = (await browser.storage.sync.get('bookmarkID')).bookmarkID;
  if (ID === undefined || browser.bookmarks.search) {  // TODO: might not work across computers
    const folder = await browser.bookmarks.create({title: chrome.i18n.getMessage("folder")});
    browser.bookmarks.create({
      title: chrome.i18n.getMessage("title"),
      url: chrome.runtime.getURL('popup.html'),
      parentId: folder.id
    });
    browser.storage.sync.set({bookmarkID: folder.id});
    return folder;
  }
  return (await browser.bookmarks.get(ID))[0];
}

export const default_settings = {
  suspenderIntegration: true, ignoreZoom: true,
  darkTheme: window.matchMedia('(prefers-color-scheme: dark)').matches
};

/**
 * @readonly
 * @enum {string}
 */
export const colors = {
  grey: "grey", blue: "blue", red: "red", yellow: "yellow",
  green: "green", pink: "pink", purple: "purple", cyan: "cyan"
};

/** @return {Promise<tabGroup>} */
export async function get_default_project() {
  const index = (await browser.storage.sync.get('index')).index + 1 || 0;
  browser.storage.sync.set({index: index});
  // TODO: increment index

  return {
    short_name: "",
    color: 'grey',
    id: index
  }
}

// Adapted from https://stackoverflow.com/a/25612056
export function localizeHtmlPage() {
  //Localize by replacing __MSG_***__ meta tags
  var objects = document.getElementsByTagName('html');
  for (var j = 0; j < objects.length; j++)
  {
    var obj = objects[j];

    var valStrH = obj.innerHTML.toString();
    var valNewH = valStrH.replace(/__MSG_(\w+)__/g, function(match, v1)
    {
      return v1 ? chrome.i18n.getMessage(v1) : "";
    });

    if(valNewH != valStrH)
    {
      obj.innerHTML = valNewH;
    }
  }
}

/**
 * Retrieves from sync storage, then tries local
 * @param {string | string[] | Object | null} selector
 * @return {Promise<Object>}
 */
export async function getStorage(selector) {
  return new Promise(res => {
    chrome.storage.sync.get(selector, syncItems => {
      chrome.storage.local.get(selector, localItems => res({...localItems, ...syncItems}));
    });
  });
}

/**
 * Automatically delegates between sync and local (preferring sync) if sync if full
 * @return {Promise<void>}
 */
export async function setStorage() {

}
