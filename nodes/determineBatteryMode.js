module.exports = function(RED) {
	function DetermineBatteryModeNode(config) {
		RED.nodes.createNode(this, config);
		const node = this;
		node.enableGridchargeThreshold = config.enableGridchargeThreshold;
		node.disableGridchargeThreshold = config.disableGridchargeThreshold;
		node.batteryCapacity = config.batteryCapacity;
		node.minsoc = config.minsoc;
		node.maxsoc = config.maxsoc;
		node.efficiency = config.efficiency;

		// dieser Knoten verarbeitet die Preise in Cent (interne Umrechnung)!
		node.on('input', function(msg) {
			let outputs = [null, null, null];

			// aus anderem Knoten berechnet
			const enableGridcharge = msg.enableGridcharge = msg.enableGridcharge || false;
			const optimize = msg.optimize = msg.optimize || false;
			
			// Standardwerte aus der Konfiguration übernehmen
			const enableGridchargeThreshold = msg.enableGridchargeThreshold = (typeof msg.enableGridchargeThreshold !== 'undefined') ? msg.enableGridchargeThreshold : (node.enableGridchargeThreshold || 50);
			const disableGridchargeThreshold = msg.disableGridchargeThreshold = (typeof msg.disableGridchargeThreshold !== 'undefined') ? msg.disableGridchargeThreshold : (node.disableGridchargeThreshold || 80);
			const batteryCapacity = msg.batteryCapacity = (typeof msg.batteryCapacity !== 'undefined') ? msg.batteryCapacity : (node.batteryCapacity || 10000);
			const feedin = msg.feedin = (typeof msg.feedin !== 'undefined') ? msg.feedin : 0.079;
			const resetminsoc = msg.minsoc = (typeof msg.minsoc !== 'undefined') ? msg.minsoc : (node.minsoc || 10);
			const resetmaxsoc = msg.maxsoc = (typeof msg.maxsoc !== 'undefined') ? msg.maxsoc : (node.maxsoc || 90);
			const efficiency = msg.efficiency = (typeof msg.efficiency !== 'undefined') ? msg.efficiency : (node.efficiency || 80);

			// Werte für die Berechnung, mit sicheren Standard vorbelegt
			let price = msg.price = ((typeof msg.price !== 'undefined') ? msg.price : 1.00) * 100;
			let soc = msg.soc = (typeof msg.soc !== 'undefined') ? msg.soc : 90;
			let minPrice = msg.minimum = ((typeof msg.minimum !== 'undefined') ? msg.minimum : feedin * 100);
			let estimatedHousehold = msg.energy_req = (typeof msg.energy_req !== 'undefined') ? msg.energy_req : 7000;
			let pvforecast = msg.pvforecast = (typeof msg.pvforecast !== 'undefined') ? msg.pvforecast : 16000;
			let avgPrice = ((typeof msg.average !== 'undefined') ? msg.average : 0.24) * 100;

			// auch Ausgabewerte
			let lastGridchargePrice = msg.lastGridchargePrice = (typeof msg.lastGridchargePrice !== 'undefined') ? msg.lastGridchargePrice : feedin;
			
			// Maximum zur Steuerung heranziehen: Glättung des Verbrauches
			let batteryControlLimit = msg.batteryControlLimit = Math.max(lastGridchargePrice, avgPrice);
			const loss = 1 + ((100 - efficiency) / 100);

			// Hilfsfunktionen
			function isWinter(month) {
				return (month >= 11 || month <= 2); // November bis Februar
			}

			function mayChargeBattery(price, minTotal, avgPrice) {
				return price <= minTotal && (price * 1.25) < avgPrice;
			}

			// Initialisiere msg.batterymode, falls nicht vorhanden
			if (typeof msg.batterymode === 'undefined') {
				msg.batterymode = "unknown";
			}

			// wenn Optimierung der Batterienutzung wirtschaftlich bzw. erlaubt
			if (optimize) {
				// Bewertung des Batteriestandes
				let socControlMode;
				if (soc > disableGridchargeThreshold) {
					socControlMode = "highSOC";
				} else if (soc <= enableGridchargeThreshold) {
					socControlMode = "lowSOC";
				} else {
					socControlMode = "mediumSOC";
				}

				// Zurücksetzen des letzten Ladepreises bei geringem/hohem Füllstand
				switch (socControlMode) {
					case "highSOC":
						if (soc > resetmaxsoc) {
							lastGridchargePrice = feedin * loss;
						}
						break;
					case "lowSOC":
						if (soc < resetminsoc) {
							lastGridchargePrice = feedin * loss;
						}
						break;
					case "mediumSOC":
						break;
				}

				// Wintermonate?
				let winterMode = isWinter((new Date()).getMonth());

				// Bestimmung von pvControlMode
				let pvControlMode;
				if (winterMode) {
					msg.estimatedConsumption = (batteryCapacity - (msg.soc / 100 * batteryCapacity) + estimatedHousehold);
					pvControlMode = (pvforecast < msg.estimatedConsumption) ? "insufficientPV" : "sufficientPV";
				} else {
					pvControlMode = "sufficientPV";
				}

				// Logik für Netzladung bei günstigem Strompreis
				if (pvControlMode === "insufficientPV" && pvControlMode !== "highSOC") {
					msg.targetMode = "hold";
					// Netzladung erlauben?
					if ((socControlMode === "lowSOC") || (socControlMode === "mediumSOC") && (msg.batterymode === "charge")) {
						let minTotal = minPrice ? parseFloat((minPrice * 1.02).toFixed(3)) : 0;
						if (enableGridcharge && mayChargeBattery(price, minTotal, msg.avgGridPriceWeekly)) {
							msg.targetMode = "charge";
							let gridchargePrice = (price / 100 * loss);
							if (gridchargePrice > lastGridchargePrice) {
								lastGridchargePrice = gridchargePrice;
							}
						}
					}
					// Batterie darf entladen, wenn Strompreis hoch	und Batterie nicht teuer geladen wurde
					if (price > batteryControlLimit && price > lastGridchargePrice) {
						msg.targetMode = "normal";
					}
				} else {
					// Batterie darf entladen, wenn PV Leistung des Tages ausreicht
					msg.targetMode = "normal";
				}
			} else {
				// Batterie darf entladen, wenn Opti
				msg.targetMode = "normal";
			}

			if (msg.batterymode !== msg.targetMode) {
				msg.batterymode = msg.targetMode;
				outputs[0] = { batterymode: msg.batterymode, lastChange: (new Date()).getTime(), payload: msg.batterymode };
			}

			// Ausgabe der Ergebnisse
			outputs[1] = (msg.lastGridchargePrice !== lastGridchargePrice) ? { lastGridchargePrice: lastGridchargePrice, lastChange: (new Date()).getTime(), payload: lastGridchargePrice } : null;
			outputs[2] = msg;

			switch (msg.batterymode) {
				case "normal":
					node.status({ fill: "green", shape: "dot", text: msg.batterymode });
					break;
				case "hold":
					node.status({ fill: "orange", shape: "dot", text: msg.batterymode });
					break;
				case "charge":
					node.status({ fill: "red", shape: "dot", text: msg.batterymode });
					break;
			}

			node.send(outputs);
		});
	}
	RED.nodes.registerType('@iseeberg79/DetermineBatteryMode', DetermineBatteryModeNode, {
		defaults: {
			name: { value: "" },
			enableGridchargeThreshold: { value: 50 },
			disableGridchargeThreshold: { value: 80 },
			batteryCapacity: { value: 10000 },
			minsoc: { value: 10 },
			maxsoc: { value: 90 },
			efficiency: { value: 80 }
		},
		outputs: 3
	});
}

