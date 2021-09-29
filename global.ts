// TODO: use 'chrome' instead of 'browser' namespace once most everything is promisified, b/c browser does not have typings for tabGroup
// TODO: enable strict null checking in tsconfig with strictNullChecks=true

export interface TabGroup {
  name: string;
  short_name: string;
  color: chrome.tabGroups.ColorEnum,
  id: number;
}

export interface StorageSchema {  // TODO
  bookmarkId?: string;
}

export async function getBookmarkRoot() {
  const ID = (await browser.storage.sync.get('bookmarkID')).bookmarkID;
  if (ID === undefined || (await browser.bookmarks.get(ID).catch(() => [])).length === 0) {  // TODO: might not work across computers
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

export const default_settings: Settings = {
  suspenderIntegration: true, ignoreZoom: true,
  darkTheme: window.matchMedia('(prefers-color-scheme: dark)').matches
};

export interface Settings {
  suspenderIntegration: boolean;
  ignoreZoom: boolean;
  darkTheme: boolean;
}

/**
 * @readonly
 * @enum {string}
 */
export const colors = {
  grey: "grey", blue: "blue", red: "red", yellow: "yellow",
  green: "green", pink: "pink", purple: "purple", cyan: "cyan"
};

export async function get_default_project() {
  const index = (await browser.storage.sync.get('index')).index + 1 || 0;
  chrome.storage.sync.set({index: index});
  // TODO: increment index

  return {
    short_name: "",
    color: 'grey' as chrome.tabGroups.ColorEnum,
    id: index as number
  }
}

// Adapted from https://stackoverflow.com/a/25612056
export function localizeHtmlPage() {
  //Localize by replacing __MSG_***__ meta tags
  const objects = document.getElementsByTagName('html');
  for (let j = 0; j < objects.length; j++) {
    const obj = objects[j];

    const valStrH = obj.innerHTML.toString();
    const valNewH = valStrH.replace(/__MSG_(\w+)__/g, function (match, v1) {
      return v1 ? chrome.i18n.getMessage(v1) : "";
    });

    if (valNewH != valStrH) {
      obj.innerHTML = valNewH;
    }
  }
}
