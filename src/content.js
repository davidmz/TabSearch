(function () {
    var DOUBLE_PRESS_TIMEOUT = 500,
        SHIFT_KEY = 16,
        ENTER_KEY = 13,
        ESCAPE_KEY = 27,
        DOWN_KEY = 40,
        UP_KEY = 38,
        CSS_PREFIX = "__tab-search-ext--",
        enKeys = "`~@#$^&|qwertyuiop[]asdfghjkl;'zxcvbnm,./QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?",
        ruKeys = "ёЁ\"№;:?/йцукенгшщзхъфывапролджэячсмитьбю.ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,",
        doc = document;

    var
        UIEl = null,
        selectedIndex = -1,
        tabList = [];

    var doubleShiftTimer = null;
    doc.body.addEventListener('keydown', function (e) {
        if (e.keyCode == SHIFT_KEY && !UIEl) {
            if (doubleShiftTimer === null) {
                doubleShiftTimer = setTimeout(function () { doubleShiftTimer = null; }, DOUBLE_PRESS_TIMEOUT);
            } else {
                clearTimeout(doubleShiftTimer);
                doubleShiftTimer = null;
                chrome.runtime.sendMessage(
                    {"action": "getTabList"},
                    function (tabs) {
                        console.log(tabs);
                        tabList = tabs;
                        showUI();
                    }
                );
            }
        } else if (e.keyCode == ESCAPE_KEY && UIEl) {
            closeUI();
        }
    });
    doc.body.addEventListener('mousedown', function (e) {
        if (!UIEl) return;
        var el = e.target, found = false;
        while (el) {
            if (!("classList" in el)) break;
            if (found = el.classList.contains(CSS_PREFIX + "container")) break;
            el = el.parentNode;
        }
        if (!found) closeUI();
    });

    var showUI = function () {
        UIEl = doc.body.appendChild(doc.createElement("div"));
        UIEl.className = CSS_PREFIX + "center-wrapper";

        var winEl = UIEl.appendChild(doc.createElement("div"));
        winEl.className = CSS_PREFIX + "container";


        var headEl = winEl.appendChild(doc.createElement("div"));
        headEl.className = CSS_PREFIX + "head";

        var inputEl = headEl.appendChild(doc.createElement("input"));
        inputEl.type = "text";
        inputEl.className = CSS_PREFIX + "input";
        inputEl.autocomplete = false;
        inputEl.focus();
        winEl.addEventListener("mouseup", function () { inputEl.focus(); });

        var listEl = winEl.appendChild(doc.createElement("div"));
        listEl.className = CSS_PREFIX + "list";
        listEl.addEventListener("click", clickHandler);

        inputEl.addEventListener("input", function () {
            drawList(listEl, inputEl.value);
        });
        inputEl.addEventListener("keydown", function (e) {
            e.stopPropagation();
            var nItems = listEl.children.length;
            if (nItems > 0) {
                if (e.keyCode == DOWN_KEY) {
                    selectedIndex = (selectedIndex + 1) % nItems;
                    updateSelection(listEl, selectedIndex);
                } else if (e.keyCode == UP_KEY) {
                    if (selectedIndex <= 0) {
                        selectedIndex = nItems - 1;
                    } else {
                        selectedIndex = (selectedIndex - 1) % nItems;
                    }
                    updateSelection(listEl, selectedIndex);
                } else if (e.keyCode == ENTER_KEY) {
                    var tabId = parseInt(listEl.children[selectedIndex < 0 ? 0 : selectedIndex].dataset.id, 10);
                    chrome.runtime.sendMessage({"action": "setTab", id: tabId}, closeUI);
                } else if (e.keyCode == ESCAPE_KEY) {
                    closeUI();
                } else {
                    return;
                }
                e.preventDefault();
            }
        });
        drawList(listEl);
    };

    var updateSelection = function (listEl, selectedIndex) {
        var selClass = CSS_PREFIX + "current-item";
        var current = listEl.querySelector(":scope > ." + selClass);
        if (current) current.classList.remove(selClass);
        if (selectedIndex >= 0) {
            listEl.children[selectedIndex].classList.add(selClass);
        }
    };

    var drawList = function (listEl, query) {
        query = query || "";
        selectedIndex = -1;
        var qLen = query.length;

        var prevWin = null;
        listEl.innerHTML = "";
        var first = true;
        tabList.forEach(function (tab) {
            var founds = transSearch(tab.title, query);
            if (founds === false) return;

            var li = listEl.appendChild(doc.createElement("div"));
            li.className = CSS_PREFIX + "item";
            li.dataset.id = tab.id;

            if (prevWin != tab.windowId) {
                prevWin = tab.windowId;
                if (!first) li.classList.add(CSS_PREFIX + "first-in-win");
            }

            var closeBtn = li.appendChild(doc.createElement("div"));
            closeBtn.className = CSS_PREFIX + "close-btn";
            closeBtn.title = chrome.i18n.getMessage("closeTab");

            var icon = li.appendChild(doc.createElement("img"));
            icon.className = CSS_PREFIX + "icon";
            var imgUrl = tab.favIconUrl;
            if (!imgUrl) {
                imgUrl = chrome.extension.getURL("img/page-white.png");
            } else if (!/^https?:/.test(imgUrl)) {
                imgUrl = chrome.extension.getURL("img/chrome-icon.png");
            } else if (location.protocol == "https:" && /^http:/.test(imgUrl)) {
                // проксируем
                imgUrl = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(imgUrl.match(/^\w+:\/\/([^/]+)/)[1]);
            }
            icon.src = imgUrl;

            var infoBox = li.appendChild(doc.createElement("div"));
            infoBox.className = CSS_PREFIX + "info-box";

            var title = infoBox.appendChild(doc.createElement("div"));
            title.className = CSS_PREFIX + "title";
            title.appendChild(textWithSelections(tab.title, founds, qLen));

            var url = infoBox.appendChild(doc.createElement("div"));
            url.className = CSS_PREFIX + "url";
            url.innerText = tab.url;

            first = false;
        });
    };

    var closeUI = function () {
        if (!UIEl) return;
        UIEl.parentNode.removeChild(UIEl);
        UIEl = null;
    };

    /**
     * Возвращает массив позиций найденных подстрок таким образом:
     * "hello, world", "o" → [4, 8] ("hell[o], w[o]rld")
     * Если подстрока не найдена, возвращается false
     * Если подстрока пуста, возвращается []
     *
     * @param {string} text
     * @param {string} query
     * @returns {Array.<number>|boolean}
     */
    var search = function (text, query) {
        query = query.toLowerCase();
        text = text.toLowerCase();
        var
            qLen = query.length,
            res = [],
            pos = 0;

        if (qLen == 0) return [];
        while (true) {
            pos = text.indexOf(query, pos);
            if (pos === -1) break;
            res.push(pos);
            pos += qLen;
        }
        return res.length ? res : false;
    };

    var makeTranscodeTable = function (from, to) {
        var tbl = {}, l = from.length, i;
        if (to.length != l) return tbl;
        for (i = 0; i < l; i++) tbl[from.charAt(i)] = to.charAt(i);
        return tbl;
    };
    var ru2enTable = makeTranscodeTable(ruKeys, enKeys),
        en2ruTable = makeTranscodeTable(enKeys, ruKeys);

    var transSearch = function (text, query) {
        var res = search(text, query);
        if (res === false) {
            if (/[\u0400-\u04ff]/.test(query) && !/[a-z]/i.test(query)) {
                res = search(text, transcode(query, ru2enTable));
            }
            if (!/[\u0400-\u04ff]/.test(query) && /[a-z]/i.test(query)) {
                res = search(text, transcode(query, en2ruTable));
            }
        }
        return res;
    };

    var transcode = function (text, table) {
        var res = "", l = text.length, i, c;
        for (i = 0; i < l; i++) {
            c = text.charAt(i);
            if (c in table) c = table[c];
            res += c;
        }
        return res;
    };

    var textWithSelections = function (text, sels, qLen) {
        var fr = doc.createDocumentFragment(),
            pos = 0;
        sels.forEach(function (sel) {
            fr.appendChild(doc.createTextNode(text.substr(pos, sel - pos)));
            fr.appendChild(doc.createElement("span")).appendChild(doc.createTextNode(text.substr(sel, qLen)));
            pos = sel + qLen;
        });
        fr.appendChild(doc.createTextNode(text.substr(pos)));
        return fr;
    };

    var clickHandler = function (e) {
        var el = e.target, tabId;
        while (el) {
            if (el.classList.contains(CSS_PREFIX + "item")) {
                tabId = parseInt(el.dataset.id, 10);
                chrome.runtime.sendMessage({"action": "setTab", id: tabId}, closeUI);
                break;
            }
            if (el.classList.contains(CSS_PREFIX + "close-btn")) {
                var it = el.parentNode;
                tabId = parseInt(it.dataset.id, 10);
                chrome.runtime.sendMessage({"action": "closeTab", id: tabId}, (function (it, tabId) {
                    return function () {
                        it.parentNode.removeChild(it);
                        for (var i = 0; i < tabList.length; i++) {
                            if (tabList[i].id == tabId) {
                                tabList.splice(i, 1);
                                break;
                            }
                        }
                    }
                })(it, tabId));
                break;
            }
            el = el.parentNode;
        }
    };

})();
