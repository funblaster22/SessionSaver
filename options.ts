import {default_settings, localizeHtmlPage} from "./global.js";

localizeHtmlPage();
let settings;


function updateSettings(ev) {
  const target = ev.target;
  console.log(target.checked, settings);
  settings[target.name] = target.checked;

  chrome.storage.local.set({settings: settings});
}


chrome.storage.local.get(['settings'], storage => {
  console.log(storage);
  settings = {...default_settings, ...storage.settings};

  // Add event listeners to radio buttons
  for (const input of document.getElementsByTagName('input')) {
    input.onchange = updateSettings;
    input.checked = settings[input.name];
  }
});

document.getElementById('reset').onclick = () => chrome.storage.local.clear(() => location.reload());
