const axios = require("axios");
module.exports = function (RED) {
    function DeterminePowerValues(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.url = config.url;

        node.on("input", async function (msg) {
            msg.url = typeof msg.url !== "undefined" ? msg.url : node.url || "http://localhost:7070/api/state";

            try {
                const response = await axios.get(msg.url);
                msg.response = response.data;
            } catch (error) {
                node.error("HTTP request error: " + error, msg);
                return;
            }

            try {
                // Abwärtskompatibel: Alte API hat .result Wrapper, neue API nicht
                const result = msg.response.result || msg.response;
                if (!result) {
                    node.error("invalid response", msg);
                    return;
                }

                let gridPower = result.gridPower || (result.grid && result.grid.power) || 0;
                let homePower = result.homePower || 0;
                let pvPower = (result.pvPower) || (result.pv && result.pv.power) || 0;
                let batteryPower = result.batteryPower || 0;
                let batterySoc = result.batterySoc || 0;
                let tariffGrid = result.tariffGrid || 0.0;
                let batteryMode = result.batteryMode || "unknown";
                let interval = result.interval || 60;

                const sumPower = result.loadpoints ? result.loadpoints.reduce((sum, lp) => sum + lp.chargePower, 0) : 0;

                msg.payload = {
                    homePower: homePower,
                    loadpointsPower: sumPower,
                    gridPower: gridPower,
                    tariffGrid: tariffGrid,
                    batteryPower: batteryPower,
                    pvPower: pvPower,
                    batterySoc: batterySoc,
                    batteryMode: batteryMode,
                    interval: interval,
                    lastchange: new Date().getTime(),
                };

                delete msg.response;

                node.send(msg);
            } catch (error) {
                node.error("general error: " + error, msg);
                return;
            }
        });
    }
    RED.nodes.registerType("@iseeberg79/DeterminePowerValues", DeterminePowerValues, {
        defaults: {
            name: { value: "" },
            url: { value: "http://localhost:7070/api/state" },
        },
        inputs: 1,
        outputs: 1,
    });
};
