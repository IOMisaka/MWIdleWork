// ==UserScript==
// @name         MWIdleWork
// @namespace    http://tampermonkey.net/
// @version      2.3.0
// @description  闲时工作队列 milky way idle 银河 奶牛
// @author       io
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @grant        GM_notification
// @license      MIT
// ==/UserScript==

(() => {
    "use strict"; 

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
    
    let settings = {
        idleActionStr: null,
        idleOn: false,
        buffNotify:false,
        recordsDict:{},
        queue:[]
    };
    let recording = false;
    let records=[];

    let idleSend = null;
    let lastActionStr = null;

    let clientQueueOn = false;
    let clientQueue = [];
    let clientQueueDecOn = false;//自动解析

    let initData_itemDetailMap = null;
    let initData_actionDetailMap = null;

    loadSettings();
    hookWS();
    hookSend();

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
            button.title = "左键前移，右键取消\n"+desc;
            button.style.display="inline";

            div.appendChild(button);
            let ele = {
                button: button,
                data: data
            }
            button.addEventListener("contextmenu",(event)=>{event.preventDefault();removeQueue(ele);});
            button.onclick = () => { upQueue(ele) };
            clientQueue.push(ele);
            save();
        }
    }
    function upQueue(ele){
        let div = document.querySelector("#script_idlediv");
        if (!div) {
            console.error("没有找到面板");
            return;
        }
        if(ele.button.previousElementSibling && ele.button.previousElementSibling.tagName==="BUTTON" ){
            div.insertBefore(ele.button,ele.button.previousElementSibling);
            let index = clientQueue.indexOf(ele);
            if(index>0){
                clientQueue.splice(index,1);
                clientQueue.splice(index-1,0,ele);
            }
        }
        save();
    }
    function removeQueue(ele) {
        clientQueue = clientQueue.filter(item => item !== ele);
        save();

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
        save();
        return ele.data;
    }
    function hookSend() {
        var oriSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function (data) {
            let obj = JSON.parse(data);
            if (data && data.indexOf("newCharacterActionData") > 0) {
                updateAction(data);
            }
            console.log("发送指令:", data);
            let _this = this;
            if (clientQueueOn) {
                console.log("client queue add:", data);
                if(clientQueueDecOn 
                    && obj && obj.type==="new_character_action" 
                    && obj.newCharacterActionData 
                    && obj.newCharacterActionData.hasMaxCount 
                    && obj.newCharacterActionData.actionHrid
                    && obj.newCharacterActionData.maxCount>0
                    && initData_actionDetailMap?.[obj.newCharacterActionData.actionHrid]?.inputItems
                ){
                    let outputItem = initData_actionDetailMap?.[obj.newCharacterActionData.actionHrid]?.outputItems[0];
                    let actions = costs2actions([{itemHrid:outputItem.itemHrid,count:outputItem.count*obj.newCharacterActionData.maxCount}]);
                    actions.forEach(action=>enqueue(JSON.stringify(action)));
                }else enqueue(data);
            } else oriSend.call(this, data);
            idleSend = function (e) { oriSend.call(_this, e) }

            if(recording){
                records.push(data);
                document.getElementById("script_buttonRecord").innerText="⏹️停止("+records.length+")";
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
        buttonRecord.id="script_buttonRecord";
        buttonRecord.innerText = "⏺录制";
        buttonRecord.title = "录制一系列操作";
        buttonRecord.onclick=()=>{
            if(recording){
                recording = false;
                buttonRecord.innerText = "⏺录制";
                buttonRecord.title = "录制一系列操作";
                let name = prompt("保存名字","操作"+Object.keys(settings.recordsDict).length);
                settings.recordsDict[name]=records;
                records=[];
                save();
                refreshRecords();
            }else{
                recording=true;
                buttonRecord.innerText="⏹️停止";
                buttonRecord.title = "停止录制动作";
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
            actButton.title = "左键执行，右键删除";
            actButton.onclick=()=>{
                for(let i=0;i<cmds.length;i++){
                    let obj = JSON.parse(cmds[i]);
                    let data = cmds[i];
                    if(obj.type === "equip_item"){
                        setTimeout(()=>idleSend(data),i*500);//避免一次发太多
                    }else{
                        enqueue(data);
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
    let currentCharacterItems = [];
    let initData_houseRoomDetailMap = null;
    function handleMessage(message) {
        let obj = JSON.parse(message);
        if (obj && obj.type === "init_character_data") {
            currentActionsHridList = [...obj.characterActions];
            currentCharacterItems = obj.characterItems;
            waitForActionPanelParent();
        }else if(obj && obj.type === "init_client_data"){
            initData_itemDetailMap = obj.itemDetailMap;
            initData_actionDetailMap = obj.actionDetailMap;
            initData_houseRoomDetailMap = obj.houseRoomDetailMap;
        }else if(obj && obj.endCharacterItems){
            let newIds = obj.endCharacterItems.map(i=>i.id);
            currentCharacterItems = currentCharacterItems.filter(e=>!newIds.includes(e.id));//移除存在的物品
            currentCharacterItems.push(...obj.endCharacterItems);//放入新物品
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
        //save queue
        let queue = [];
        clientQueue.forEach(e=>queue.push(e.data));
        settings.queue = queue;

        localStorage.setItem("script_idlework", JSON.stringify(settings));
    }
    function loadSettings() {
        let o = localStorage.getItem("script_idlework");
        if (o) {
            settings = JSON.parse(o);
        }
        settings.recordsDict = settings.recordsDict || {};
        settings.queue = settings.queue || [];

        updateAction(settings.idleActionStr);
        settings.queue.forEach(e => enqueue(e));
    }


    /* 动作面板 */
    const waitForActionPanelParent = () => {
        const targetNode = document.querySelector("div.GamePage_contentPanel__Zx4FH");
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

                        if (
                            added?.classList?.contains("Modal_modalContainer__3B80m") &&
                            added.querySelector("div.HousePanel_modalContent__2Zv1N")
                        ) {
                            handleHousePanelAdd(added.querySelector("div.HousePanel_modalContent__2Zv1N"));
                        }
                        if (
                            added?.classList?.contains("Modal_modalContainer__3B80m")
                        ){
                            console.log(added);
                        }
                    }
                    for (const rm of mutation.removedNodes) {
                        if (
                            rm?.classList?.contains("Modal_modalContainer__3B80m") &&
                            rm.querySelector("div.SkillActionDetail_nonenhancingComponent__1Y-ZY")
                        ) {
                            handleActionPanelRemove(rm.querySelector("div.SkillActionDetail_nonenhancingComponent__1Y-ZY"));
                        }

                        if (
                            rm?.classList?.contains("Modal_modalContainer__3B80m") &&
                            rm.querySelector("div.HousePanel_modalContent__2Zv1N")
                        ) {
                            handleHousePanelRemove(rm.querySelector("div.HousePanel_modalContent__2Zv1N"));
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
            let html = '<div><input type="checkbox" id="script_clientQueue"><label for="script_clientQueue">加入闲时队列  </label><input type="checkbox" id="script_clientQueueDec"><label id="script_clientQueueDecLabel" for="script_clientQueueDec">解析需求</label></div>';
            buttons.insertAdjacentHTML("afterend", html);

            let checkClientQueue = panel.querySelector("#script_clientQueue");
            let checkClientQueueDec = panel.querySelector("#script_clientQueueDec");
            let checkClientQueueDecLabel = panel.querySelector("#script_clientQueueDecLabel");

            checkClientQueueDecLabel.title = "必须输入制作数量，才能分析需要的材料";
            checkClientQueueDec.style.display="none";//默认隐藏
            checkClientQueueDecLabel.style.display="none";

            checkClientQueue.onclick = () => {
                clientQueueOn = checkClientQueue.checked;
                if(clientQueueOn){
                    checkClientQueueDec.style.display="initial";
                    checkClientQueueDecLabel.style.display="initial";
                }else{
                    checkClientQueueDec.style.display="none";
                    checkClientQueueDecLabel.style.display="none";
                }
            }

            checkClientQueueDec.onclick=()=>{
                clientQueueDecOn = checkClientQueueDec.checked;
            }
        }
    }
    async function handleActionPanelRemove(panel) {
        clientQueueOn = false;
        clientQueueDecOn = false;
    }
    function createObj(actionHrid,count){
        return {
            "type": "new_character_action",
            "newCharacterActionData": {
                "actionHrid": actionHrid,
                "hasMaxCount": true,
                "maxCount": count,
                "upgradeItemHash": "",
                "enhancingMaxLevel": 0,
                "enhancingProtectionItemHash": "",
                "enhancingProtectionItemMinLevel": 0,
                "shouldClearQueue": false
            }
        }
    }
    function deconstructItem(item,actionList,inventoryPool){
        let count = 0;
        if(inventoryPool.hasOwnProperty(item.itemHrid)){
            count=inventoryPool[item.itemHrid];
        }else{
            count=getItemCount(item.itemHrid);
            inventoryPool[item.itemHrid]=count;
        }
        if(count>=item.count){//本材料足够，不用做
            count-=item.count;
            inventoryPool[item.itemHrid] = count;
        }else{//材料不够
            let need = item.count-count;
            inventoryPool[item.itemHrid] = 0;

            let act = Object.entries(initData_actionDetailMap).find(([k,v])=>v.outputItems?.[0]?.itemHrid===item.itemHrid);//找到产出该材料的动作（合成
            let nop;
            if(act){
                [nop,act] = act;//解构
                //做材料
                act.inputItems.forEach(ii=>{
                    let icount = need/act.outputItems[0].count*ii.count;//材料数量=需求量/每次产出*输入个数
                    deconstructItem({itemHrid:ii.itemHrid,count:icount},actionList,inventoryPool);
                });

                //加入待做列表
                let times = Math.ceil(need/act.outputItems[0].count);
                if(times>0){
                    let data = createObj(act.hrid,times);
                    console.log(`加入：${act.hrid}+${times}`);
                    actionList.push(data);
                }
            }else{
                [nop,act] = Object.entries(initData_actionDetailMap).find(([k,v])=>v.dropTable?.[0]?.itemHrid===item.itemHrid&&v.dropTable?.[0]?.dropRate===1);//基础采集
                let perCount = (act.dropTable[0].minCount+act.dropTable[0].maxCount)/2;//每次采集期望
                let times = Math.ceil(need/perCount);
                if(times>0){
                    let data = createObj(act.hrid,times);
                    console.log(`加入：${act.hrid}+${times}`);
                    actionList.push(data);
                }
            }
        }
    }
    function deconstructItems(items){
        let actionList=[];
        let inventoryPool={};
        items.forEach(item => {
            deconstructItem(item,actionList,inventoryPool);
        });
        return actionList;
    }
    // [{itemHrid:"/items/lumber",count:1}]
    function costs2actions(costs){
        let actions = deconstructItems(costs);
        return actions;
    }
    function getItemCount(itemHrid){
        return currentCharacterItems.find(item=>item.itemHrid===itemHrid)?.count||0;
    }
    function costs2needs(costs){
        let needs = [];
        costs.forEach(
            item=>{
                let need = item.count - getItemCount(item.itemHrid);
                //if(need<0)need=0;
                needs.push({itemHrid:item.itemHrid,count:need});
            }
        )
        return needs;
    }
    async function handleHousePanelAdd(panel) {
        let buildButton = panel.querySelector("div.Button_button__1Fe9z");
        if (buildButton) {
            let addButton = document.createElement("button");
            addButton.onclick = ()=>{
                let roomName = panel.querySelector("div.HousePanel_header__2oNIL").innerText;
                let toLevel = panel.querySelector("div.HousePanel_level__1wpys").innerText.split(" ").slice(-1)[0];
                console.log("room:"+roomName+toLevel);

                let [_,roomInfo] = Object.entries(initData_houseRoomDetailMap).find(([k,v])=>v.name === roomName);
                let costs = roomInfo.upgradeCostsMap[toLevel];
                costs = costs.slice(1);//coin remove
                let actions = costs2actions(costs);
                actions.forEach(action=>enqueue(JSON.stringify(action)));
            }
            addButton.innerText = "加入队列";
            buildButton.parentNode.appendChild(addButton);
        }
    }
    async function handleHousePanelRemove(panel) {
        
    }
})();
