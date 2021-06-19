/*chrome.runtime.onInstalled.addListener(function() {

});*/

// TODO: make less confusing

chrome.runtime.onConnect.addListener(port => {
    console.log("Connected");
    port.onMessage.addListener(cmd => {
      console.log("message received " + cmd);
      if (cmd[0] === "load") {
        const tabs = [];
        const projectName = cmd[1];
        chrome.storage.sync.get(projectName, storage => {
          const urls = storage[projectName];  // TODO: what is this type?
          chrome.tabGroups.query({color: urls.color, title: urls.shortName, windowId: chrome.windows.WINDOW_ID_CURRENT}, async tabGroup => {
            // Add tabs to existing group, if exists
            let existingTabs = [];
            let tabGroupId: number | undefined;
            if (tabGroup.length === 1) {
              tabGroupId = tabGroup[0].id;
              // don't duplicate tabs if exist
              // TODO: set correct order
              existingTabs = (await chrome.tabs.query({/*TODO groupId: tabGroup*/}))
                  .map(tab => tab.groupId === tabGroupId && tab.url);
              console.log("EXISTING", existingTabs);
              urls.tabs = urls.tabs.filter(tabURL => !existingTabs.includes(tabURL));
            } else {
              tabGroupId = undefined;
            }
            for (const url of urls.tabs) {
              chrome.tabs.create({url: url}, tab => {
                tabs.push(tab.id);
                if (tabs.length === urls.tabs.length) {  // Run here after all tabs loaded
                  console.log(tabs);
                  chrome.tabs.group({tabIds: tabs, groupId: tabGroupId}, groupId => {
                    chrome.tabs.highlight({tabs: tabs});  // Documentation says to use index, but seems to work fine with ID
                    // TODO: make highlight new tabs every time, even if no new tabs were added
                    chrome.tabGroups.update(groupId, {title: urls.shortName, color: urls.color});
                  });
                }
              });
            }
          });
        });
      }
      //port.postMessage("done");
    });
});
