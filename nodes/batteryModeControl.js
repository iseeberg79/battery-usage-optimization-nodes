const axios = require("axios");

module.exports = function(RED) {
	function BatteryModeControlNode(config) {
		RED.nodes.createNode(this, config);
		const node = this;
		node.url = config.url || "http://localhost:7070/api/batterymode";
		node.interval = config.interval || 30; // Standardwert: 30 Sekunden
		node.repeatMode = config.repeatMode || false; // Wiederholung an/aus
		let intervalId = null;

		node.on("input", async function(msg) {
			const mode = msg.payload?.mode;

			if (!["unknown", "normal", "hold", "charge"].includes(mode)) {
				node.error("Ungültiger Modus: " + mode, msg);
				return;
			}

			try {
				await axios.post(`${node.url}/${mode}`);
				node.status({ fill: "green", shape: "dot", text: `Modus: ${mode}` });
			} catch (error) {
				node.error("Fehler beim API-Call: " + error, msg);
				return;
			}

			// Wiederholung nur aktivieren, wenn repeatMode eingeschaltet ist
			if (node.repeatMode && ["hold", "charge"].includes(mode)) {
				if (intervalId) clearInterval(intervalId);
				intervalId = setInterval(async () => {
					try {
						await axios.post(`${node.url}/${mode}`);
						node.status({ fill: "yellow", shape: "ring", text: `Sende erneut: ${mode}` });
					} catch (error) {
						node.error("Fehler bei wiederholendem Senden: " + error);
					}
				}, node.interval * 1000);
			} else {
				if (intervalId) clearInterval(intervalId);
				intervalId = null;
			}
		});
	}

	RED.nodes.registerType("@iseeberg79/BatteryModeControl", BatteryModeControlNode, {
		defaults: {
			name: { value: "" },
			url: { value: "http://localhost:7070/api/batterymode" },
			interval: { value: 30 },
			repeatMode: { value: false }, // Schalter für Wiederholung
		},
	});
};
