import {default_settings, get_default_project, getBookmarkRoot, Settings, TabGroup} from './global.js'

const port = chrome.runtime.connect({
  name: "Backend"
});
port.onMessage.addListener(msg => {
  console.log("message received " + msg);
});
let ctrlPressed = false;

function loadProject(name) {
  // TODO: don't open new tab in addition
  chrome.windows.create({focused: true}, () => {
    // Tab loading logic must occur in background b/c popup gets terminated before adding to group
    port.postMessage(["load", name]);
    window.close();
  });
}

async function _addGroup(tabGroup: chrome.tabGroups.TabGroup|number): Promise<void> {
  let shortName = "";
  if (!Number.isInteger(tabGroup)) {
    tabGroup = tabGroup.id;
    shortName = tabGroup.title;
  } else if (tabGroup !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    shortName = (await chrome.tabGroups.get(tabGroup)).title;
  }
  chrome.storage.sync.get('index', storage => {
    const allProjects = Object.values(storage).map(val => val.shortName);
    console.log(shortName, allProjects);
    if (allProjects.includes(shortName)) {
      // TODO: don't skip, instead set `name`
      console.log(`project '${shortName}' already exists, skipping`);
      return;
    }

    chrome.tabs.query({currentWindow: true/*, groupId: tabGroup*/}, tabs => {
      // TODO: for some reason, querying by group ID does not work in chrome 89, try again later
      tabs = tabs.filter(tab => tab.groupId === tabGroup);
      const name = prompt('What is the project name of "' + shortName + '"?')
      if (name == null) return;
      chrome.tabs.group({tabIds: tabs.map(tab => tab.id), groupId: tabGroup === chrome.tabGroups.TAB_GROUP_ID_NONE ? undefined : tabGroup}, groupId => {
        // get actual color
        chrome.tabGroups.get(groupId, group => {
          chrome.storage.sync.set({[name]: {shortName: shortName, color: group.color, tabs: tabs.map(tab => tab.url)}});
        });
      });
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

/** Show saved project groups in popup gui */
async function renderAllProjects() {
  let totalProjects;

  // TODO: might be inefficient due to redundant function calls, but necessary to user has not edited folder since last run
  // Maybe implement some sort of caching with browser.storage.sync to remember the meta IDs?
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

    function makeQuery(obj: { [s: string]: any; }) {
      const searchStr = [];
      for (const [key, val] of Object.entries(obj)) {
        if (val !== undefined && val !== null)
          searchStr.push(String(key) + '=' + String(val));
      }
      return '?' + searchStr.join('&');
    }

    // DB query: O(?) + O(?)
    // Best time: O(n)
    // Worst time: O(n*m) + O
    // Where N is the number of projects, and M is the number of metadata bookmarks, which will likely equal N
    const subtree = (await browser.bookmarks.getSubTree((await getBookmarkRoot()).id))[0];
    const metadata = await browser.bookmarks.search({title: 'metadata'});  // TODO: map to just index?
    totalProjects = subtree.children.length;
    for (const project of subtree.children) {
      let metaIndex: number | undefined;
      if (!project.children) continue;  // Ignore non-folders
      if (project.children[0].title === 'metadata') {  // TODO: add check to ensure url is correct
        metaIndex = 0;
      } else {
        for (const bookmark of metadata) {  // If metadata is not first bookmark in project, check indices of metadata
          console.log(bookmark.title);
          if (project.id === bookmark.parentId) {
            // TODO: remove index once it is found?
            metaIndex = bookmark.index;
            break;
          }
        }
        if (metaIndex === undefined) {  // Folder does not have metadata, so create new
          const newBookmark = await get_default_project();
          browser.bookmarks.create({index: 0, parentId: project.id, title: "metadata", url: "about:blank" + makeQuery(newBookmark)})
          yield {index: 0, name: project.title, ...newBookmark};
          continue;
        }
      }
      const projMetadata = parseQuery(new URL(project.children[metaIndex].url).search);
      yield {index: metaIndex, name: project.title,
        short_name: projMetadata.short_name || "", id: parseInt(projMetadata.id) || (await get_default_project()).id, color: projMetadata.color as chrome.tabGroups.ColorEnum || "grey"};
    }

    /*// Time Complexity: 4*O(n) + O(m)
    const projectFolders = (await browser.bookmarks.getChildren((await getBookmarkRoot()).id))
        .filter(node => node.url === undefined)  // Remove non-folders
    const projectFolderIds = projectFolders.map(node => node.id);  // Get id of each folder
    const projectFolderNames = projectFolders.map(node => node.title);  // Get name of each folder
    // TODO: can have multiple meta bookmarks in same folder
    // TODO: will projectFolderIds & metadata always correspond?
    const metadata = (await browser.bookmarks.search({title: 'metadata'}))
        .filter(node => projectFolderIds.includes(node.parentId))  // Only include metadata that is part of this extension

    console.log(metadata, projectFolderIds, projectFolderNames);
    totalProjects = projectFolderIds.length;
    console.log("Used memory:", window.performance.memory.usedJSHeapSize / 100000);
    // Now, metadata.length <= projectFolders.length, meaning projectFolders is never undefined when looping
    for (let i=0; i<Math.max(metadata.length, projectFolderIds.length); i++) {
      if (metadata[i] === undefined) {  // Folder does not have metadata, so create new
        const newBookmark = await get_default_project();
        browser.bookmarks.create({index: 0, parentId: projectFolderIds[i], title: "metadata", url: "about:blank" + makeQuery(newBookmark)})
        yield {index: 0, name: projectFolderNames[i], ...newBookmark};
        continue;
      }
      yield {index: metadata[i].index, name: projectFolderNames[i], ...parseQuery(new URL(metadata[i].url).search)};
    }*/
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
    const label = document.createElement('label')
    const button = document.createElement('button');
    button.innerText = details.short_name;
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

    button.onclick = loadProject.bind(this, details.name);
    label.appendChild(button)
    label.append(details.name);
    document.querySelector('#projects.content').appendChild(label);
  }
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
