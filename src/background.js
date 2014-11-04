chrome.runtime.onMessage.addListener(function (request, sender, callback) {
    if (request.action == "getTabList") {
        var list = [];
        chrome.tabs.query({}, function (tabs) {
            tabs.forEach(function (tab) {
                list.push({
                    id: tab.id,
                    windowId: tab.windowId,
                    title: tab.title,
                    url: tab.url,
                    favIconUrl: tab.favIconUrl
                });
            });
            callback(list);
        });
    } else if (request.action == "setTab") {
        chrome.tabs.get(request.id, function (tab) {
            chrome.windows.update(tab.windowId, {focused: true}, function () {
                chrome.tabs.update(request.id, {active: true}, callback);
            });
        });
    } else if (request.action == "closeTab") {
        chrome.tabs.remove(request.id, callback);
    } else if (request.action == "newTab") {
        chrome.tabs.create({url: "https://www.google.com/search?btnI&q=" + encodeURIComponent(request.text), openerTabId: sender.tab.id}, callback);
    }
    return true;
});