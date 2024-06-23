// ==UserScript==
// @name         MWIdleWork
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  闲时工作队列 milky way idle 银河 奶牛
// @author       io
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @license      MIT
// ==/UserScript==

(() => {
    "use strict";

    let settings = {
        idleActionStr: null,
        idleOn: false,
    };
    let idleSend = null;
    let lastActionStr = null;
    
    let clientQueueOn = false;

    loadSettings();

    hookWS();
    hookSend();
    let clientQueue = [];
    function enqueue(data){
        let div = document.querySelector("#script_idlediv");
        if(!div){
            console.log("没有找到面板");
            return;
        }
        let obj = JSON.parse(data);
        if(!obj || obj.type!=="new_character_action")return;

        let button = document.createElement("button");
        
        button.innerText=obj.newCharacterActionData.hasMaxCount?obj.newCharacterActionData.maxCount:"♾️";
        button.title=obj.newCharacterActionData.actionHrid;

        div.appendChild(button);
        let ele = {
            button:button,
            data:data
        }
        button.onclick=()=>{removeQueue(ele)};
        clientQueue.push(ele);
    }
    function removeQueue(ele){
        clientQueue = clientQueue.filter(item=>item!==ele);

        let div = document.querySelector("#script_idlediv");
        if(!div){
            console.log("没有找到面板");
            return;
        }

        div.removeChild(ele.button);
        
    }
    //移除button 返回数据
    function dequeue(){
        let div = document.querySelector("#script_idlediv");
        if(!div){
            console.log("没有找到面板");
            return;
        }

        let ele = clientQueue.shift();
        div.removeChild(ele.button);
        return ele.data;
    }
    function hookSend() {
        var oriSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function (data) {
            if (data && data.indexOf("newCharacterActionData") > 0) {
                let obj = JSON.parse(data);
                console.log("最后发送指令:", data);
                updateAction(data);
            }
            let _this = this;
            if(clientQueueOn){
                console.log("client queue add:",data);
                enqueue(data);
            }else
                oriSend.call(this, data);
            idleSend = function (e) { oriSend.call(_this, e) }
        }
    }
    function updateAction(data) {
        if (data) lastActionStr = data;

        let idlediv = document.querySelector("#script_idlediv");
        if (idlediv) return;

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
        txtInfo.innerText = "开启";

        let txtSaved = document.createElement("span");
        txtSaved.innerText = getActionFromStr(settings.idleActionStr);

        let checkIdle = document.createElement("input");
        checkIdle.type = "checkbox";
        checkIdle.checked = settings.idleOn;
        checkIdle.onchange = () => {

            settings.idleOn = checkIdle.checked;
            txtSaved.style.display = settings.idleOn ? "inline" : "none";

            save();
        }

        let buttonSave = document.createElement("button");
        buttonSave.innerText = "保存指令";
        buttonSave.onclick = () => {
            settings.idleActionStr = lastActionStr;
            console.log("保存指令：", lastActionStr);
            txtSaved.innerText = getActionFromStr(lastActionStr);

            checkIdle.checked = true;

            settings.idleOn = checkIdle.checked;
            txtSaved.style.display = settings.idleOn ? "inline" : "none";

            save();
        };

        div.appendChild(txtInfo);
        div.appendChild(checkIdle);
        div.appendChild(buttonSave);
        div.appendChild(txtSaved);

        document.querySelector("body").appendChild(div);
    }
    function getActionFromStr(str) {
        if (!str) return "";
        var obj = JSON.parse(str);
        if (!obj) return "";
        return obj.newCharacterActionData.actionHrid;obj.newCharacterActionData.count
    }
    function doIdle() {
        console.log("空闲");
        if(clientQueue.length>0){//队列
            idleSend(dequeue());
            return true;
        }else if (settings.idleOn && settings.idleActionStr && idleSend) {//空闲任务
            idleSend(settings.idleActionStr);
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
    let currentActionsHridList = [];
    function handleMessage(message) {
        let obj = JSON.parse(message);
        if (obj && obj.type === "init_character_data") {
            waitForActionPanelParent();
        }
        else if (obj && obj.type === "actions_updated") {
            for (const action of obj.endCharacterActions) {
                if (action.isDone === false) {
                    currentActionsHridList.push(action);
                } else {
                    currentActionsHridList = currentActionsHridList.filter((o) => {
                        return o.id !== action.id;
                    });
                }
            }
            if (currentActionsHridList.length == 0) {
                doIdle();
            }
        }
        updateAction();
        return message;
    }

    function save() {
        localStorage.setItem("script_idlework", JSON.stringify(settings));
    }
    function loadSettings() {
        let o = localStorage.getItem("script_idlework");
        if (o) {
            settings = JSON.parse(o);

        }
    }


    /* 动作面板 */
    const waitForActionPanelParent = () => {
        const targetNode = document.querySelector("div.GamePage_mainPanel__2njyb");
        if (targetNode) {
            console.log("start observe action panel");
            const actionPanelObserver = new MutationObserver(async function (mutations) {
                for (const mutation of mutations) {
                    for (const added of mutation.addedNodes) {
                        if (
                            added?.classList?.contains("Modal_modalContainer__3B80m") &&
                            added.querySelector("div.SkillActionDetail_nonenhancingComponent__1Y-ZY")
                        ) {
                            handleActionPanelAdd(added.querySelector("div.SkillActionDetail_nonenhancingComponent__1Y-ZY"));
                        }
                    }
                    for (const rm of mutation.removedNodes){
                        if (
                            rm?.classList?.contains("Modal_modalContainer__3B80m") &&
                            rm.querySelector("div.SkillActionDetail_nonenhancingComponent__1Y-ZY")
                        ) {
                            handleActionPanelRemove(rm.querySelector("div.SkillActionDetail_nonenhancingComponent__1Y-ZY"));
                        }
                    }
                }
            });
            actionPanelObserver.observe(targetNode, { attributes: false, childList: true, subtree: true });
        } else {
            setTimeout(waitForActionPanelParent, 200);
        }
    };

    async function handleActionPanelAdd(panel) {
        if (!panel.querySelector("div.SkillActionDetail_expGain__F5xHu")) {
            return; // 不处理战斗ActionPanel
        }
        let buttons = panel.querySelector("div.SkillActionDetail_buttonsContainer__sbg-V");
        if(buttons){
            console.log(buttons);
            let html = '<div><input type="checkbox" id="script_clientQueue"><span>加入闲时队列</span></div>';
            buttons.insertAdjacentHTML("afterend",html);
            let checkClientQueue = panel.querySelector("#script_clientQueue");
            checkClientQueue.onclick=()=>{
                clientQueueOn = checkClientQueue.checked;
            }
        }
    }
    async function handleActionPanelRemove(panel){
        clientQueueOn = false;
    }
})();
