(function () {
    var DOUBLE_PRESS_TIMEOUT = 1000,
        SHIFT_KEY = 16,
        ENTER_KEY = 13,
        ESCAPE_KEY = 27,
        DOWN_KEY = 40,
        UP_KEY = 38,
        enKeys = "`~@#$^&|qwertyuiop[]asdfghjkl;'zxcvbnm,./QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?",
        ruKeys = "ёЁ\"№;:?/йцукенгшщзхъфывапролджэячсмитьбю.ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,",
        doc = document;

    var
        UIEl = null,
        lastActiveElement = null,
        selectedIndex = -1,
        tabList = [];

    /**
     * Ловим нажатие (А) - отпускание - нажатие - отпускание (Б) клавиши Shift,
     * так чтобы между А и Б прошло не более DOUBLE_PRESS_TIMEOUT и
     * не были нажаты или отпущены другие клавиши.
     */
    (function (handler) {
        var lastShiftState = false,
            shiftCounter = 0,
            doubleShiftTimer = null;

        doc.body.addEventListener('keydown', function (e) {
            if (e.keyCode == SHIFT_KEY && !lastShiftState) {
                lastShiftState = true;
                if (!doubleShiftTimer) {
                    shiftCounter = 0;
                    doubleShiftTimer = setTimeout(function () { doubleShiftTimer = null; }, DOUBLE_PRESS_TIMEOUT);
                } else {
                    shiftCounter++;
                }
            } else if (e.keyCode != SHIFT_KEY && doubleShiftTimer) {
                clearTimeout(doubleShiftTimer);
                doubleShiftTimer = null;
                shiftCounter = 0;
            }
        });

        doc.body.addEventListener('keyup', function (e) {
            if (e.keyCode == SHIFT_KEY && lastShiftState) {
                lastShiftState = false;
                if (doubleShiftTimer && shiftCounter > 0) {
                    clearTimeout(doubleShiftTimer);
                    doubleShiftTimer = null;
                    shiftCounter = 0;
                    handler();
                }
            } else if (e.keyCode != SHIFT_KEY && doubleShiftTimer) {
                clearTimeout(doubleShiftTimer);
                doubleShiftTimer = null;
                shiftCounter = 0;
            }
        });
    })(function () {
        if (UIEl) return;
        try {
            chrome.runtime.sendMessage(
                {"action": "getTabList"},
                function (tabs) {
                    tabList = tabs;
                    mainUIEl(showUI());
                }
            );
        } catch (e) {
            reloadMessageEl(showUI());
        }
    });

    doc.body.addEventListener('mousedown', function (e) {
        if (!UIEl) return;
        for (var i = 0; i < e.path.length; i++) {
            var el = e.path[i];
            if ("classList" in el && el.classList.contains("container")) {
                return;
            }
        }
        hideUI();
    });

    var msgTexts = {
        "reloadMessageText": chrome.i18n.getMessage("reloadMessageText"),
        "reloadButtonText": chrome.i18n.getMessage("reloadButtonText"),
        "cancelButtonText": chrome.i18n.getMessage("cancelButtonText")
    };

    function reloadMessageEl(win) {
        var msg = win.appendChild(doc.createElement("div"));
        msg.className = "message";
        msg.appendChild(doc.createElement("div")).innerText = msgTexts["reloadMessageText"];
        var btn = msg.appendChild(doc.createElement("button"));
        btn.innerText = msgTexts["reloadButtonText"];
        btn.addEventListener("click", function () { location.reload(); });
        btn.focus();
        var btn2 = msg.appendChild(doc.createElement("button"));
        btn2.innerText = msgTexts["cancelButtonText"];
        btn2.addEventListener("click", hideUI);
    }

    function showUI() {
        lastActiveElement = document.activeElement;
        // наш представитель в документе
        UIEl = doc.body.appendChild(doc.createElement("div"));
        UIEl.className = "__tab-search-ext-UI";

        var root = UIEl.createShadowRoot();
        var wrapper = root.appendChild(doc.createElement("div"));
        wrapper.className = "center-wrapper";
        var winEl = wrapper.appendChild(doc.createElement("div"));
        winEl.className = "container";
        return winEl;
    }

    var mainUIEl = function (winEl) {
        var headEl = winEl.appendChild(doc.createElement("div"));
        headEl.className = "head";

        var inputEl = headEl.appendChild(doc.createElement("input"));
        inputEl.type = "text";
        inputEl.className = "input";
        inputEl.autocomplete = false;
        inputEl.focus();
        winEl.addEventListener("mouseup", function (e) { if (e.target !== inputEl) inputEl.focus(); });

        var listEl = winEl.appendChild(doc.createElement("div"));
        listEl.className = "list";
        listEl.addEventListener("click", clickHandler);

        inputEl.addEventListener("input", function () {
            drawList(listEl, inputEl.value);
        });
        inputEl.addEventListener("keydown", function (e) {
            e.stopPropagation();
            var nItems = listEl.children.length;
            if (e.keyCode == DOWN_KEY) {
                if (nItems > 0) {
                    selectedIndex = (selectedIndex + 1) % nItems;
                    updateSelection(listEl, selectedIndex);
                }
            } else if (e.keyCode == UP_KEY) {
                if (nItems > 0) {
                    if (selectedIndex <= 0) {
                        selectedIndex = nItems - 1;
                    } else {
                        selectedIndex = (selectedIndex - 1) % nItems;
                    }
                    updateSelection(listEl, selectedIndex);
                }
            } else if (e.keyCode == ENTER_KEY) {
                if (nItems > 0 && !e.ctrlKey) {
                    var tabId = parseInt(listEl.children[selectedIndex < 0 ? 0 : selectedIndex].dataset.id, 10);
                    chrome.runtime.sendMessage({"action": "setTab", id: tabId}, hideUI);
                } else {
                    chrome.runtime.sendMessage({"action": "newTab", text: e.target.value}, hideUI);
                }
            } else if (e.keyCode == ESCAPE_KEY) {
                hideUI();
            } else {
                return;
            }
            e.preventDefault();
        });
        drawList(listEl);
    };

    var updateSelection = function (listEl, selectedIndex) {
        var selClass = "current-item";
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
        var winBlock = null;
        tabList.forEach(function (tab) {
            var titleFounds = transSearch(tab.title, query);
            var domainFounds = transSearch(tab.domain.text, query);
            if (titleFounds === false && domainFounds === false) return;

            if (prevWin != tab.windowId) {
                prevWin = tab.windowId;
                winBlock = listEl.appendChild(doc.createElement("div"));
                winBlock.className = "win";
            }

            var li = winBlock.appendChild(doc.createElement("div"));
            li.className = "item";
            li.dataset.id = tab.id;

            var closeBtn = li.appendChild(doc.createElement("div"));
            closeBtn.className = "close-btn";
            closeBtn.title = chrome.i18n.getMessage("closeTab");

            var icon = li.appendChild(doc.createElement("img"));
            icon.className = "icon";
            var imgUrl = tab.favIconUrl;
            if (!imgUrl) {
                imgUrl = chrome.extension.getURL("img/page-white.png");
            } else if (/^data:image\//.test(imgUrl)) {
                // ok
            } else if (!/^https?:/.test(imgUrl)) {
                imgUrl = chrome.extension.getURL("img/chrome-icon.png");
            } else if (location.protocol == "https:" && /^http:/.test(imgUrl)) {
                // проксируем
                imgUrl = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(imgUrl.match(/^\w+:\/\/([^/]+)/)[1]);
            }
            icon.src = imgUrl;

            var infoBox = li.appendChild(doc.createElement("div"));
            infoBox.className = "info-box";

            var title = infoBox.appendChild(doc.createElement("div"));
            title.className = "title";
            title.appendChild(textWithSelections(tab.title, titleFounds, qLen));

            var url = infoBox.appendChild(doc.createElement("div"));
            url.className = "url";
            url.appendChild(doc.createTextNode(tab.urlText.substr(0, tab.domain.off)));
            url.appendChild(textWithSelections(tab.domain.text, domainFounds, qLen));
            url.appendChild(doc.createTextNode(tab.urlText.substr(tab.domain.off + tab.domain.text.length)));
        });
    };

    var hideUI = function () {
        if (!UIEl) return;
        UIEl.parentNode.removeChild(UIEl);
        if (lastActiveElement && "focus" in lastActiveElement) lastActiveElement.focus();
        UIEl = null;
        lastActiveElement = null;
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
        if (sels !== false) {
            sels.forEach(function (sel) {
                fr.appendChild(doc.createTextNode(text.substr(pos, sel - pos)));
                var sp = fr.appendChild(doc.createElement("span"));
                sp.className = "hl";
                sp.innerText = text.substr(sel, qLen);
                pos = sel + qLen;
            });
        }
        fr.appendChild(doc.createTextNode(text.substr(pos)));
        return fr;
    };

    var clickHandler = function (e) {
        var el = e.target, tabId;
        while (el) {
            if (el.classList.contains("item")) {
                tabId = parseInt(el.dataset.id, 10);
                chrome.runtime.sendMessage({"action": "setTab", id: tabId}, hideUI);
                break;
            }
            if (el.classList.contains("close-btn")) {
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
