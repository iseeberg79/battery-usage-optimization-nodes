module.exports = function(RED) {
    function DeterminePowerValues(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.url = config.url;

        node.on('input', async function(msg) {
            msg.url = (typeof msg.url !== 'undefined') ? msg.url : (node.url || 'http://localhost:7070/api/state');

            try {
                const response = await axios.get(msg.url);
                msg.response = response.data;
            } catch (error) {
                node.error('HTTP-Anfrage Fehler: ' + error, msg);
                return;
            }

            let batteryPower = msg.response.result.batteryPower;
            let homePower = msg.response.result.homePower;
            let gridPower = msg.response.result.gridPower;
            let tariffGrid = msg.response.result.tariffGrid;
            let pvPower = msg.response.result.pvPower;
            let batterySoc = msg.response.result.batterySoc;
            let batteryMode = msg.response.result.batteryMode;
            let interval = msg.response.result.interval;
            const sumPower = msg.response.result.loadpoints.reduce((sum, lp) => sum + lp.chargePower, 0);

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
                lastchange: (new Date()).getTime()
            };

            delete msg.response;

            node.send(msg);
        });
    }
    RED.nodes.registerType('@iseeberg79/DeterminePowerValues', DeterminePowerValues, {
        defaults: {
            name: { value: "" },
            url: { value: "http://localhost:7070/api/state" }
        },
        inputs: 1,
        outputs: 1
    });
};

