const axios = require("axios");

module.exports = function(RED) {
	function BatteryModeControlNode(config) {
		RED.nodes.createNode(this, config);
		const node = this;
		node.url = config.url || "http://localhost:7070/api/batterymode";
		node.gridChargeUrl = config.gridChargeUrl || "http://localhost:7070/api/batterygridchargelimit";
		node.interval = config.interval || 30;
		node.repeatMode = config.repeatMode || false;
		let intervalId = null;

		// evcc benennt "hold" seit evcc-io/evcc#36103 in "holddischarge" um; ältere Versionen lehnen den neuen Namen mit 400 ab
		async function postMode(mode) {
			if (mode !== "hold") {
				return axios.post(`${node.url}/${mode}`);
			}
			try {
				return await axios.post(`${node.url}/holddischarge`);
			} catch (error) {
				if (error.response?.status !== 400) {
					throw error;
				}
				return axios.post(`${node.url}/hold`);
			}
		}

		node.on("input", async function(msg) {
			// "holddischarge" (evcc-Name seit evcc-io/evcc#36103) als Alias für "hold" akzeptieren
			const mode = msg.payload?.mode === "holddischarge" ? "hold" : msg.payload?.mode;
			const gridChargeLimit = msg.payload?.gridChargeLimit;

			// Prüfen, ob genau **einer** der beiden Werte gesetzt ist
			if ((mode !== undefined && gridChargeLimit !== undefined) || (mode === undefined && gridChargeLimit === undefined)) {
				node.error("Ungültige Eingabe: Entweder 'mode' oder 'gridChargeLimit' muss gesetzt sein, aber nicht beide gleichzeitig.", msg);
				return;
			}

			try {
				// **Modus setzen**
				if (mode !== undefined) {
					if (!["unknown", "normal", "hold", "charge"].includes(mode)) {
						node.error("Ungültiger Modus: " + mode, msg);
						return;
					}

					if (mode === "normal") {
						await axios.delete(`${node.url}`);
					} else {
						await postMode(mode);
					}
					node.status({ fill: "green", shape: "dot", text: `Modus: ${mode}` });

					// **Wiederholung für batteryMode**
					if (node.repeatMode && ["hold", "charge"].includes(mode)) {
						if (intervalId) { 
							clearInterval(intervalId); 
						}
						intervalId = setInterval(async () => {
							try {
								await postMode(mode);
								node.status({ fill: "yellow", shape: "ring", text: `Sende erneut: ${mode}` });
							} catch (error) {
								node.error("Fehler bei wiederholendem Senden: " + error);
							}
						}, node.interval * 1000);
					} else {
						if (intervalId) {
							clearInterval(intervalId);
							intervalId = null;
						}
						node.status({ fill: "green", shape: "dot", text: `Modus: ${mode}` });
					}
				}

				// **Battery Grid Charge Limit setzen oder entfernen**
				if (gridChargeLimit !== undefined) {
					if (gridChargeLimit > 0) {
						await axios.post(`${node.gridChargeUrl}/${gridChargeLimit}`);
						node.status({ fill: "blue", shape: "dot", text: `Grid Charge Limit: ${gridChargeLimit}` });
					} else {
						await axios.delete(`${node.gridChargeUrl}`);
						node.status({ fill: "gray", shape: "dot", text: `Grid Charge Limit entfernt` });
					}
				}
			} catch (error) {
				node.error("Fehler beim API-Call: " + error, msg);
				return;
			}
		});
	}

	RED.nodes.registerType("@iseeberg79/BatteryModeControl", BatteryModeControlNode, {
		defaults: {
			name: { value: "" },
			url: { value: "http://localhost:7070/api/batterymode" },
			gridChargeUrl: { value: "http://localhost:7070/api/batterygridchargelimit" },
			interval: { value: 30 },
			repeatMode: { value: false },
		},
	});
};
