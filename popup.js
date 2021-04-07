import {get_default_project, getBookmarkRoot} from './global.js'

const port = chrome.extension.connect({
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

async function _addGroup(/** chrome.TabGroup | int */ tabGroup) /** void */ {
  let shortName = "";
  if (!Number.isInteger(tabGroup)) {
    tabGroup = tabGroup.id;
    shortName = tabGroup.title;
  } else if (tabGroup !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    shortName = (await new Promise(res => chrome.tabGroups.get(tabGroup, group => res(group)))).title;
  }
  chrome.storage.sync.get(null, storage => {
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
  // TODO: might be inefficient due to redundant function calls, but necessary to user has not edited folder since last run
  // Maybe implement some sort of caching with browser.storage.sync to remember the meta IDs?
  /** @return {AsyncGenerator<import('./global.js').tabGroup, void, *>} */
  async function* getProjectsMeta() {
    // Adapted from https://stackoverflow.com/a/13419367
    function parseQuery(/** string */ queryString) {
      const query = {};
      const pairs = (queryString[0] === '?' ? queryString.substr(1) : queryString).split('&');
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i].split('=');
        query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
      }
      return query;
    }

    function makeQuery(/** Object */ obj) {
      const searchStr = [];
      for (const [key, val] of Object.entries(obj)) {
        if (val !== undefined && val !== null)
          searchStr.push(String(key) + '=' + String(val));
      }
      return '?' + searchStr.join('&');
    }

    const projectFolders = (await browser.bookmarks.getChildren((await getBookmarkRoot()).id))
        .filter(node => node.url === undefined)  // Remove non-folders
    const projectFolderIds = projectFolders.map(node => node.id);  // Get id of each folder
    const projectFolderNames = projectFolders.map(node => node.title);  // Get name of each folder
    // TODO: can have multiple meta bookmarks in same folder
    // TODO: will projectFolderIds & metadata always correspond?
    const metadata = (await browser.bookmarks.search({title: 'metadata'}))
        .filter(node => projectFolderIds.includes(node.parentId))  // Only include metadata that is part of this extension

    console.log(metadata, projectFolderIds, projectFolderNames);
    // Now, metadata.length <= projectFolders.length, meaning projectFolders is never undefined when looping
    for (let i=0; i<Math.max(metadata.length, projectFolderIds.length); i++) {
      if (metadata[i] === undefined) {  // Folder does not have metadata, so create new
        const newBookmark = await get_default_project();
        browser.bookmarks.create({index: 0, parentId: projectFolderIds[i], title: "metadata", url: "about:blank" + makeQuery(newBookmark)})
        yield {index: 0, name: projectFolderNames[i], ...newBookmark};
        continue;
      }
      yield {index: metadata[i].index, name: projectFolderNames[i], ...parseQuery(new URL(metadata[i].url).search)};
    }
  }

  /**
   * Creates two objects from one object, moving the items specified by 'sep' to the new object
   * @param {Object} obj
   * @param {string} sep
   * @return {Object}
   */
  function splitObject(obj, ...sep) {
    const newObj = {}
    for (const key of sep) {
      newObj[key] = obj[key];
      delete obj[key];
    }
    return newObj;
  }

  const settings = (await browser.storage.local.get('settings')).settings;
  const workspaces = await browser.storage.sync.get(null);
  const metadata = splitObject(workspaces, 'bookmarkID', 'index');
  console.log(workspaces, metadata);
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
}

function searcher(ev) {
  for (const entry of document.getElementById(ev.target.dataset.target).children) {
    if (entry.innerText.toLowerCase().includes(ev.target.value.toLowerCase()))
      entry.style.display = "block";
    else
      entry.style.display = "none";
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
    if (rule.selectorText === '.content::before') {
      rule.style.height = document.querySelector('.content').getBoundingClientRect().height + 'px';
      break;
    }
  }

  // Make search boxes searchable
  for (const search of document.getElementsByClassName('search')) {
    search.oninput = searcher;
  }
};
