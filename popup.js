/** @typedef {{shortName: string, color: string, tabs: string[]}} tabGroup */
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
function renderAllProjects() {
  chrome.storage.local.get(null, storage => {
    const settings = storage.settings;
    chrome.storage.sync.get(null, items => {
      for (const [name, details] of Object.entries(items)) {
        const label = document.createElement('label')
        const button = document.createElement('button');
        button.innerText = details.shortName;
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

        button.onclick = loadProject.bind(this, name);
        label.appendChild(button)
        label.append(name);
        document.querySelector('#projects.content').appendChild(label);
      }
    });
  });

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
