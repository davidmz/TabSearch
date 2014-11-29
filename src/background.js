chrome.runtime.onMessage.addListener(function (request, sender, callback) {
    if (request.action == "getTabList") {
        var list = [];
        chrome.tabs.query({}, function (tabs) {
            tabs.forEach(function (tab) {
                var urlText = decodeURIComponent(tab.url);
                var off = 0;
                var domain = "";
                var m = /^(.*?:\/\/(?:www\.)?)([^\/]+)(.*)/.exec(urlText);
                if (m) {
                    off = m[1].length;
                    domain = punycode.toUnicode(m[2]);
                    urlText = m[1] + domain + m[3];
                    m = /^(.*?)\.[^.]+$/.exec(domain);
                    if (m) {
                        domain = m[1];
                    }
                }
                list.push({
                    id: tab.id,
                    windowId: tab.windowId,
                    title: tab.title,
                    url: tab.url,
                    urlText: urlText,
                    domain: {off: off, text: domain},
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
        chrome.tabs.create({
            url: "https://www.google.com/search?btnI&q=" + encodeURIComponent(request.text),
            openerTabId: sender.tab.id
        }, callback);
    }
    return true;
});

chrome.commands.onCommand.addListener(function (command) {
    if (command == "showUI") {
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, "showUI");
            }
        });
    }
});