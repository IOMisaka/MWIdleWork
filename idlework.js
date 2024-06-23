// ==UserScript==
// @name         MWIdleWork
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  闲时工作
// @author       io
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// ==/UserScript==

(() => {
    "use strict";

    let currentActionsHridList = [];

    hookWS();
    hookSend();

    var lastActionStr = null;
    var idleActionStr = null;
    var idleOn = false;
    var idleSend = null;
    function hookSend() {
        var oriSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function (data) {
            if (data && data.indexOf("newCharacterActionData") > 0) {
                let obj = JSON.parse(data);
                console.log("最后发送指令:", data);
                updateAction(data);
            }
            let _this = this;
            oriSend.call(this, data);
            idleSend = function (e) { oriSend.call(_this, e) }
        }
    }
    function updateAction(data) {
        lastActionStr = data;

        let idlediv = document.querySelector("#script_idlediv");
        if (idlediv)return;

        let div = document.createElement("div");
        div.id = "script_idlediv";
        div.title = "保存最后指令";
        div.style.border = "1px solid";
        div.style.borderColor = "grey";
        div.style.backgroundColor = "rgb(255 38 100)";
        div.style.color = "white";
        div.style.borderRadius = "2px";
        div.style.left = "0px";
        div.style.top = "0px";
        div.style.position = "fixed";
        div.style.zIndex = "9999";

        let txtInfo = document.createElement("span");
        txtInfo.innerHTML = "开启";

        let checkIdle = document.createElement("input");
        checkIdle.type = "checkbox";
        checkIdle.onchange = () => { idleOn = checkIdle.checked; }


        let txtSaved = document.createElement("span");
        txtSaved.innerHTML = "";

        let buttonSave = document.createElement("button");
        buttonSave.innerText = "保存指令";
        buttonSave.onclick = () => {
            idleActionStr = lastActionStr;
            var obj = JSON.parse(idleActionStr);
            console.log("保存指令：",idleActionStr);
            txtSaved.innerHTML = obj.newCharacterActionData.actionHrid;
            checkIdle.checked = true;
        };

        div.appendChild(txtInfo);
        div.appendChild(checkIdle);
        div.appendChild(buttonSave);
        div.appendChild(txtSaved);

        document.querySelector("body").appendChild(div);
    }
    function doIdle() {
        console.log("空闲");
        if (idleOn && idleActionStr && idleSend) {
            idleSend(idleActionStr);
            return true;
        }
        return false;
    }

    function hookWS() {
        const dataProperty = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");
        const oriGet = dataProperty.get;

        dataProperty.get = hookedGet;
        Object.defineProperty(MessageEvent.prototype, "data", dataProperty);

        function hookedGet() {
            const socket = this.currentTarget;
            if (!(socket instanceof WebSocket)) {
                return oriGet.call(this);
            }
            if (socket.url.indexOf("api.milkywayidle.com/ws") <= -1 && socket.url.indexOf("api-test.milkywayidle.com/ws") <= -1) {
                return oriGet.call(this);
            }

            const message = oriGet.call(this);
            Object.defineProperty(this, "data", { value: message }); // Anti-loop

            return handleMessage(message);
        }
    }

    function handleMessage(message) {
        let obj = JSON.parse(message);
        if (obj && obj.type === "actions_updated") {
            for (const action of obj.endCharacterActions) {
                if (action.isDone === false) {
                    currentActionsHridList.push(action);
                } else {
                    currentActionsHridList = currentActionsHridList.filter((o) => {
                        return o.id !== action.id;
                    });
                }
            }
            if (currentActionsHridList.length==0) {
                doIdle();
            }
        }
        return message;
    }
})();
