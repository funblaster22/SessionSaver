import {
  bookmarkRootID,
  default_project,
  default_settings,
  getBookmarkRoot,
  Settings,
  TabGroup
} from './global.js'

const port = chrome.runtime.connect({
  name: "Backend"
});
port.onMessage.addListener(msg => {
  console.log("message received " + msg);
});
let ctrlPressed = false;

async function loadProject(ev) {
  // TODO: don't open new tab in addition
  if (ctrlPressed) await chrome.windows.create({focused: true});
  // Tab loading logic must occur in background b/c popup gets terminated before adding to group
  port.postMessage(["load", {id: ev.target.id, ...ev.target.dataset}]);
  //TODO: remove once done debugging window.close();
}

async function _addGroup(tabGroup: chrome.tabGroups.TabGroup|number): Promise<void> {
  let shortName = "";
  if (typeof tabGroup !== 'number') {
    shortName = tabGroup.title;
    tabGroup = tabGroup.id;
  } else if (tabGroup !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    shortName = (await chrome.tabGroups.get(tabGroup)).title;
  }

  const longName = prompt('What is the project name of "' + shortName + '"?')
  // TODO: duplicate detection by longName or shortName, don't add groups that are being tracked

  const projectFolder = (await chrome.bookmarks.create({title: longName, parentId: await bookmarkRootID})).id;
  const tabs = await chrome.tabs.query({currentWindow: true, groupId: tabGroup});
  for (const tab of tabs)
    chrome.bookmarks.create({url: tab.url, title: tab.title, parentId: projectFolder});
  chrome.tabs.group({tabIds: tabs.map(tab => tab.id), groupId: tabGroup === chrome.tabGroups.TAB_GROUP_ID_NONE ? undefined : tabGroup}, groupId => {
    // get actual color
    chrome.tabGroups.get(groupId, group => {
      chrome.bookmarks.create({index: 0, title: "metadata", parentId: projectFolder, url: 'about:blank' + makeQuery(
        {short_name: shortName, color: group.color}
      )});
    });
  });
}

function addCurrentGroup(ev) {
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    console.assert(tabs.length === 1, "Incorrect number of tabs, expected 1, got " + tabs.length);
    if (tabs[0].groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
      if (!confirm("No tab group is selected. Add all ungrouped tabs?"))
        return;
    }
    _addGroup(tabs[0].groupId);
  });
}

function addAllGroups(ev) {
  chrome.tabGroups.query({windowId: chrome.windows.WINDOW_ID_CURRENT}, groups => {
    if (groups.length === 0) alert("No groups in active window");
    for (const grp of groups) {
      _addGroup(grp.id);
    }
  });
}

// Convert object to HTML query string
function makeQuery(obj: { [s: string]: any; }) {
  const searchStr = [];
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined && val !== null)
      searchStr.push(String(key) + '=' + String(val));
  }
  return '?' + searchStr.join('&');
}

/** Show saved project groups in popup gui */
async function renderAllProjects() {
  let totalProjects = 0;

  async function* getProjectsMeta(): AsyncGenerator<TabGroup, void, any> {
    // Adapted from https://stackoverflow.com/a/13419367
    function parseQuery(queryString: string): { [x: string]: string } {
      const query = {};
      const pairs = (queryString[0] === '?' ? queryString.substr(1) : queryString).split('&');
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i].split('=');
        query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
      }
      return query;
    }

    // Map<folder ID, folder name>
    const projectFolders = (await browser.bookmarks.getChildren((await getBookmarkRoot()).id))
        .reduce<Map<string, string>>((acc, item) => {
          if (!item.url) acc.set(item.id, item.title);  // Ensure item is a folder
          return acc;
        }, new Map());
    for (const node of await browser.bookmarks.search({title: 'metadata'})) {
      if (node.url && projectFolders.has(node.parentId)) {  // Ensure not a folder & within the SessionSaver directory
        const projMetadata = parseQuery(new URL(node.url).search) as {[P in keyof TabGroup]: string};
        yield {name: projectFolders.get(node.parentId), shortname: projMetadata.shortname || "",
          id: node.parentId,
          color: projMetadata.color as chrome.tabGroups.ColorEnum || "grey"};
        projectFolders.delete(node.parentId);
      }
    }
    for (const [orphanFolderId, orphanFolderName] of projectFolders.entries()) {
      // Create a metadata entry for folders that do not have one
      browser.bookmarks.create({index: 0, parentId: orphanFolderId, title: "metadata", url: "about:blank" + makeQuery(default_project)})
      yield {name: orphanFolderName, id: orphanFolderId, ...default_project};
    }
  }

  /** Creates two objects from one object, moving the items specified by 'sep' to the new object */
  function splitObject(obj: object, ...sep: string[]): object {
    const newObj = {}
    for (const key of sep) {
      newObj[key] = obj[key];
      delete obj[key];
    }
    return newObj;
  }

  const startTime = new Date().getTime();
  const settings: Settings = (await browser.storage.local.get('settings'))?.settings || default_settings;
  const workspaces = await browser.storage.sync.get(null);
  const metadata = splitObject(workspaces, 'bookmarkID', 'index');
  console.log("Workspaces", workspaces);
  console.log("Metadata", metadata);
  for await (const details of getProjectsMeta()) {
    totalProjects++;
    const label = document.createElement('label');
    const button = document.createElement('button');
    button.id = details.id;
    button.dataset.color = details.color;
    button.dataset.shortname = details.shortname;
    button.innerText = details.shortname;
    button.className = "group";
    button.draggable = true;
    const colors = settings.darkTheme ? {
          grey: "#bdc1c6", blue: "#8ab4f8", red: "#f28b82", yellow: "#fdd663",
          green: "#81c995", pink: "#ff8bcb", purple: "#d7aefb", cyan: "#78d9ec"
        } :
        {
          grey: "#5f6368", blue: "#1a73e8", red: "#d93025", yellow: "#e37400",
          green: "#1e8e3e", pink: "#d01884", purple: "#9334e6", cyan: "#007b83"
        };
    button.style.backgroundColor = colors[details.color];

    button.onclick = loadProject;
    label.appendChild(button)
    label.append(details.name);
    document.querySelector('#projects.content').appendChild(label);
  }
  // TODO: remove once done debugging
  console.log("Average time to load each project:", (new Date().getTime() - startTime) / totalProjects + "ms");
  localStorage.loadTime += (new Date().getTime() - startTime) / totalProjects + " ";
}

function searcher(ev) {
  for (const entry of document.getElementById(ev.target.dataset.target).children as HTMLCollectionOf<HTMLElement>) {
    entry.style.display = entry.innerText.toLowerCase().includes(ev.target.value.toLowerCase()) ? "block" : "none";
  }
}


window.onload = () => {
  console.log("STARTED");
  renderAllProjects();
  document.getElementById('newProj').onclick = _addGroup.bind(this, chrome.tabGroups.TAB_GROUP_ID_NONE);
  document.getElementById('allGrps').onclick = addAllGroups;
  document.getElementById('curGrp').onclick = addCurrentGroup;
  document.onkeydown = document.onkeyup = ev => {ctrlPressed = ev.ctrlKey};

  // Set scroll shadow height
  for (const rule of document.styleSheets[0].cssRules) {
    if (rule instanceof CSSStyleRule && rule.selectorText === '.content::before') {
      rule.style.height = document.querySelector('.content').getBoundingClientRect().height + 'px';
      break;
    }
  }

  // Make search boxes searchable
  for (const search of document.getElementsByClassName('search') as HTMLCollectionOf<HTMLElement>) {
    search.oninput = searcher;
  }
};
