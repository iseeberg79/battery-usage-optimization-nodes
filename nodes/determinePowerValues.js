const axios = require('axios');
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

			// Überprüfe, ob die Nachricht die alte oder neue API-Struktur (01/2025) von evcc hat
			let gridPower = msg.response.result.gridPower || msg.response.result.grid.power || 0;
					
			let homePower = msg.response.result.homePower || 0;
			let pvPower = msg.response.result.pv.power || 0;

			let batteryPower = msg.response.result.batteryPower || 0;
			let batterySoc = msg.response.result.batterySoc || 0;
									
			let tariffGrid = msg.response.result.tariffGrid || 0.00;
			let batteryMode = msg.response.result.batteryMode || "unknown";
			let interval = msg.response.result.interval || 60;
			
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
