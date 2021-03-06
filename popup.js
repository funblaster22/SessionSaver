/** @typedef {{shortName: string, color: string, tabs: string[]}} tabGroup */
const port = chrome.extension.connect({
  name: "Backend"
});
port.onMessage.addListener(msg => {
  console.log("message received " + msg);
});

/** Makes a project group out of all tabs open in window */
function makeProjWin() {
  chrome.tabs.query({currentWindow: true, groupId: chrome.tabGroups.TAB_GROUP_ID_NONE}, tabs => {
    const name = prompt('Name of Group');
    if (name == null) return;
    chrome.tabs.group({tabIds: tabs.map(tab => tab.id)}, groupId => {
      // get actual color
      chrome.tabGroups.get(groupId, group => {
        chrome.storage.sync.set({[name]: {shortName: "", color: group.color, tabs: tabs.map(tab => tab.url)}});
      });
    });
  });
}

function loadProject(name) {
  // Tab loading logic must occur in background b/c popup gets terminated before adding to group
  port.postMessage(["load", name]);

  /*const tabs = [];
  chrome.storage.sync.get(name, urls => {
    for (const url of urls[name]) {
      chrome.tabs.create({url: url}, tab => {
        tabs.push(tab.id);
        console.log(tabs);
        if (tabs.length === urls[name].length)
          console.log("FINISHED");
          chrome.tabs.group({tabIds: tabs});
        chrome.tabs.group({tabIds: tab.id});
      });
    }
  });*/
}


/** Show saved project groups in popup gui */
function renderAllProjects() {
  chrome.storage.sync.get(null, items => {
    for (const [name, urls] of Object.entries(items)) {
      const button = document.createElement('button');
      button.innerText = name;
      button.onclick = loadProject.bind(this, name);
      document.body.appendChild(button);
    }
  });
}

window.onload = () => {
  console.log("STARTED");
  renderAllProjects();
  document.getElementById('newProj').onclick = makeProjWin;
};
