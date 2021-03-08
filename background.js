/*chrome.runtime.onInstalled.addListener(function() {

});*/

// TODO: make less confusing
chrome.extension.onConnect.addListener(function(port) {
    console.log("Connected");
    port.onMessage.addListener(cmd => {
      console.log("message received " + cmd);
      if (cmd[0] === "load") {
        const tabs = [];
        const name = cmd[1];  // TODO: rename more descriptive, like projectName or groupName
        chrome.storage.sync.get(name, urls => {  // TODO: rename urls to 'storage' and urls=storage[name]
          chrome.tabGroups.query({color: urls[name].color, title: urls[name].shortName, windowId: chrome.windows.WINDOW_ID_CURRENT}, async tabGroup => {
            // Add tabs to existing group, if exists
            let existingTabs = [];
            if (tabGroup.length === 1) {
              tabGroup = tabGroup[0].id;
              // don't duplicate tabs if exist
              // TODO: set correct order
              existingTabs = (await new Promise(res =>
                chrome.tabs.query({/*TODO groupId: tabGroup*/}, tabsInGrp => res(tabsInGrp))
              )).map(tab => tab.groupId === tabGroup && tab.url);
              console.log("EXISTING", existingTabs);
              urls[name].tabs = urls[name].tabs.filter(tabURL => !existingTabs.includes(tabURL));
            } else {
              tabGroup = undefined;
            }
            for (const url of urls[name].tabs) {
              chrome.tabs.create({url: url}, tab => {
                tabs.push(tab.id);
                if (tabs.length === urls[name].tabs.length) {  // Run here after all tabs loaded
                  console.log(tabs);
                  chrome.tabs.group({tabIds: tabs, groupId: tabGroup}, groupId => {
                    chrome.tabs.highlight({tabs: tabs});  // Documentation says to use index, but seems to work fine with ID
                    // TODO: make hilight new tabs every time, even if no new tabs were added
                    chrome.tabGroups.update(groupId, {title: urls[name].shortName, color: urls[name].color});
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
