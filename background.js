/*chrome.runtime.onInstalled.addListener(function() {

});*/

chrome.extension.onConnect.addListener(function(port) {
    console.log("Connected");
    port.onMessage.addListener(cmd => {
      console.log("message received " + cmd);
      if (cmd[0] === "load") {
        const tabs = [];
        const name = cmd[1];  // TODO: rename more descriptive, like projectName or groupName
        chrome.storage.sync.get(name, urls => {  // TODO: rename urls to 'storage' and urls=storage[name]
          chrome.tabGroups.query({color: urls[name].color, title: urls[name].shortName, windowId: chrome.windows.WINDOW_ID_CURRENT}, tabGroup => {
            // Add tabs to existing group, if exists
            // TODO: don't duplicate tabs if exist
            tabGroup = tabGroup.length === 1 ? tabGroup[0].id : undefined;
            for (const url of urls[name].tabs) {
              chrome.tabs.create({url: url}, tab => {
                tabs.push(tab.id);
                if (tabs.length === urls[name].tabs.length) {  // Run here after all tabs loaded
                  console.log(tabs);
                  chrome.tabs.group({tabIds: tabs, groupId: tabGroup}, groupId => {
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
