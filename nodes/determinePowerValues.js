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
			let gridPower;
			if (typeof msg.response.result.gridPower !== undefined) {
				gridPower = msg.response.result.gridPower;
			} else {
				gridPower = msg.response.result.grid.power;
			}
			
			let batteryPower;
			if (typeof msg.response.result.batteryPower !== undefined) {
				batteryPower = msg.response.result.batteryPower;
			} else {
				batteryPower = msg.response.result.battery.power;
			}			

			let homePower;
			if (typeof msg.response.result.homePower !== undefined) {
				homePower = msg.response.result.homePower;
			} else {
				homePower = msg.response.result.home.power;
			}	

			let pvPower;
			if (typeof msg.response.result.pvPower !== undefined) {
				pvPower = msg.response.result.pvPower;
			} else {
				pvPower = msg.response.result.pv.power;
			}	

			let batterySoc;
			if (typeof msg.response.result.batterySoc !== undefined) {
				batterySoc = msg.response.result.batterySoc;
			} else {
				batterySoc = msg.response.result.battery.soc;
			}
									
			let tariffGrid = msg.response.result.tariffGrid;
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
