// ==UserScript==
// @name         MWIdleWork
// @namespace    http://tampermonkey.net/
// @version      2.1.0
// @description  闲时工作队列 milky way idle 银河 奶牛
// @author       io
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @grant        GM_notification
// @license      MIT
// ==/UserScript==

(() => {
    "use strict";

    let settings = {
        idleActionStr: null,
        idleOn: false,
        buffNotify:false,
        recordsDict:{}
    };
    let recording = false;
    let records=[];

    let idleSend = null;
    let lastActionStr = null;

    let clientQueueOn = false;

    loadSettings();

    hookWS();
    hookSend();
    let clientQueue = [];

    const icons = {
        "milking": "🐄",
        "foraging": "🍄",
        "woodcutting": "🌳",
        "cheesesmithing": "🧀",
        "crafting": "🖐️",
        "tailoring": "🧵",
        "cooking": "🧑‍🍳",
        "brewing": "🍵",
        "enhancing": "🛠️",
        "combat": "⚔️"
    };
    function transIcon(str) {
        let action = str.split("/")[2];
        return icons[action] ?? "🏀";
    }
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    function enqueue(data) {
        let div = document.querySelector("#script_idlediv");
        if (!div) {
            console.error("没有找到面板");
            return;
        }
        let obj = JSON.parse(data);
        
        if (!obj) return;
        if(obj.type === "new_character_action"){//加入待办队列
            let button = document.createElement("button");
            const{desc,icon,count}=getDescIconCountFromStr(data);
            button.innerText = icon+count;
            button.title = desc;
            button.style.display="inline";

            div.appendChild(button);
            let ele = {
                button: button,
                data: data
            }
            button.onclick = () => { removeQueue(ele) };
            clientQueue.push(ele);
        }
    }
    function removeQueue(ele) {
        clientQueue = clientQueue.filter(item => item !== ele);

        let div = document.querySelector("#script_idlediv");
        if (!div) {
            console.error("没有找到面板");
            return;
        }

        div.removeChild(ele.button);

    }
    //移除button 返回数据
    function dequeue() {
        let div = document.querySelector("#script_idlediv");
        if (!div) {
            console.error("没有找到面板");
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
                updateAction(data);
            }
            console.log("发送指令:", data);
            let _this = this;
            if (clientQueueOn) {
                console.log("client queue add:", data);
                enqueue(data);
            } else
                oriSend.call(this, data);
            idleSend = function (e) { oriSend.call(_this, e) }

            if(recording){
                records.push(data);
            }
        }
    }
    function updateAction(data) {
        if (data) lastActionStr = data;

        let idlediv = document.querySelector("#script_idlediv");
        if (idlediv) return;

        let div = document.createElement("div");
        div.id = "script_idlediv";
        div.style.border = "1px solid";
        div.style.borderColor = "grey";
        div.style.backgroundColor = "rgb(33 76 141)";
        div.style.color = "white";
        div.style.borderRadius = "2px";
        div.style.left = "0px";
        div.style.top = "0px";
        div.style.position = "fixed";
        div.style.zIndex = "9999";

        let txtSaved = document.createElement("span");

        const{desc,icon,count} = getDescIconCountFromStr(settings.idleActionStr);
        txtSaved.title = desc;
        txtSaved.innerText = icon+count;

        let checkBuff = document.createElement("input");
        checkBuff.type = "checkbox";
        checkBuff.checked = settings.buffNotify;
        checkBuff.onchange = () => {
            settings.buffNotify = checkBuff.checked;
            save();
        }
        let txtBuff = document.createElement("span");
        txtBuff.innerText = "🔔";
        checkBuff.title = txtBuff.title = txtBuff.title = "社区buff提醒";

        let checkIdle = document.createElement("input");
        checkIdle.type = "checkbox";
        checkIdle.checked = settings.idleOn;
        checkIdle.title = "闲时执行";
        checkIdle.onchange = () => {
            settings.idleOn = checkIdle.checked;
            save();
        }

        let buttonSave = document.createElement("button");
        buttonSave.innerText = "保存";
        buttonSave.style.display="inline";
        buttonSave.title = "保存最后指令";
        buttonSave.onclick = () => {

            settings.idleActionStr = lastActionStr;
            console.log("保存", lastActionStr);

            const {desc,icon,count} = getDescIconCountFromStr(lastActionStr);
            txtSaved.title = desc;
            txtSaved.innerText = icon+count;

            checkIdle.checked = true;
            settings.idleOn = checkIdle.checked;
            save();
        };

        let txtQueue = document.createElement("span");
        txtQueue.innerText = "队列->";

        //记录
        let recordsDiv = document.createElement("div");
        recordsDiv.id="script_recordsDiv";
        recordsDiv.style.display="inline";
        div.appendChild(recordsDiv);
        
        let buttonRecord = document.createElement("button");
        buttonRecord.innerText = "⏺";
        buttonRecord.title = "录制一系列操作";
        buttonRecord.onclick=()=>{
            if(recording){
                recording = false;
                buttonRecord.innerText = "⏺";
                let name = prompt("保存名字","操作"+Object.keys(settings.recordsDict).length);
                settings.recordsDict[name]=records;
                records=[];
                save();
                refreshRecords();
            }else{
                recording=true;
                buttonRecord.innerText="⏹️";
            }
        }
        div.appendChild(buttonRecord);
        //

        div.appendChild(checkBuff);
        div.appendChild(txtBuff);

        div.appendChild(checkIdle);
        div.appendChild(txtSaved);
        div.appendChild(buttonSave);

        div.appendChild(txtQueue);

        document.querySelector("body").appendChild(div);
        refreshRecords();
    }
    function refreshRecords(){
        let recordsDiv = document.getElementById("script_recordsDiv");
        recordsDiv.innerHTML="";
        for(let key in settings.recordsDict){
            let cmds = settings.recordsDict[key];
            let actButton = document.createElement("button");
            actButton.innerText = key;
            actButton.onclick=()=>{
                for(var i=0;i<cmds.length;i++){
                    let obj = JSON.parse(cmds[i]);
                    if(obj.type === "equip_item"){
                        let data = cmds[i];
                        setTimeout(()=>idleSend(data),i*300);//避免一次发太多
                    }else{
                        enqueue(cmds[i]);
                    }
                }
            }
            actButton.addEventListener("contextmenu",(event)=>{
                event.preventDefault();
                delete settings.recordsDict[key];
                recordsDiv.removeChild(actButton);
                save();
            })
            recordsDiv.appendChild(actButton);
        }
    }
    function getDescIconCountFromStr(str) {
        let desc = "动作";
        let icon = "";
        let count = "";
        if (!str){ 
            return {desc,icon,count};
        }
        var obj = JSON.parse(str);
        if (!obj || obj.type!=="new_character_action"){ 
            return {desc,icon,count};
        }

        icon = transIcon(obj.newCharacterActionData.actionHrid);
        count = obj.newCharacterActionData.hasMaxCount?obj.newCharacterActionData.maxCount:"♾️";
        desc = obj.newCharacterActionData.actionHrid;
        return {desc,icon,count};
    }
    let sendLimit=false;
    function doIdle() {
        console.log("空闲");
        if (clientQueue.length > 0) {//队列
            idleSend(dequeue());
            return true;
        } else if (settings.idleOn && settings.idleActionStr && idleSend) {//空闲任务
            sendLimit = true;
            setTimeout(() => {
                sendLimit=false;
                idleSend(settings.idleActionStr);
            }, Math.random()*500+500);
            
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
            currentActionsHridList = [...obj.characterActions];
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
        }else if(obj && obj.type==="community_buffs_updated" && settings.buffNotify){
            if (typeof GM_notification === "undefined" || !GM_notification) {
                console.error("notificate null GM_notification");
            }else GM_notification({
                text:"🔔社区buff有更新",
                title:"银河奶牛",
                timeout:60000,
                silent:false,
                highlight:true,
                tag: "MWIdleWork",
                onclick: () => {
                    window.focus();
                }
            });
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
        settings.recordsDict = settings.recordsDict || {};
    }


    /* 动作面板 */
    const waitForActionPanelParent = () => {
        const targetNode = document.querySelector("div.GamePage_mainPanel__2njyb");
        if (targetNode) {
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
                    for (const rm of mutation.removedNodes) {
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
        let buttons = panel.querySelector("div.SkillActionDetail_buttonsContainer__sbg-V");
        if (buttons) {
            let html = '<div><input type="checkbox" id="script_clientQueue"><span>加入闲时队列</span></div>';
            buttons.insertAdjacentHTML("afterend", html);
            let checkClientQueue = panel.querySelector("#script_clientQueue");
            checkClientQueue.onclick = () => {
                clientQueueOn = checkClientQueue.checked;
            }
        }
    }
    async function handleActionPanelRemove(panel) {
        clientQueueOn = false;
    }
})();
