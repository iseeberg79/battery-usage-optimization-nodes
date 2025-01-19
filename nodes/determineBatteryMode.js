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
		let debug = false;

		// dieser Knoten verarbeitet die Preise in Cent!
		node.on('input', function(msg) {
			if (typeof msg.debug !== 'undefined') { debug = msg.debug; }

			let outputs = [null, null, null];

			// aus anderem Knoten berechnet
			const enableGridcharge = (typeof msg.enableGridcharge !== "undefined") ? msg.enableGridcharge : false;
			const optimize = (typeof msg.optimize !== "undefined") ? msg.optimize : false;

			// Standardwerte aus der Konfiguration übernehmen
			const enableGridchargeThreshold = msg.enableGridchargeThreshold = (typeof msg.enableGridchargeThreshold !== 'undefined') ? msg.enableGridchargeThreshold : (node.enableGridchargeThreshold || 50);
			const disableGridchargeThreshold = msg.disableGridchargeThreshold = (typeof msg.disableGridchargeThreshold !== 'undefined') ? msg.disableGridchargeThreshold : (node.disableGridchargeThreshold || 80);
			const batteryCapacity = msg.batteryCapacity = (typeof msg.batteryCapacity !== 'undefined') ? msg.batteryCapacity : (node.batteryCapacity || 10000);
			const feedin = msg.feedin = (typeof msg.feedin !== 'undefined') ? msg.feedin : 0.079;
			const resetminsoc = msg.minsoc = (typeof msg.minsoc !== 'undefined') ? msg.minsoc : (node.minsoc || 10);
			const resetmaxsoc = msg.maxsoc = (typeof msg.maxsoc !== 'undefined') ? msg.maxsoc : (node.maxsoc || 90);
			const efficiency = msg.efficiency = (typeof msg.efficiency !== 'undefined') ? msg.efficiency : (node.efficiency || 80);

			// Werte für die Berechnung, mit sicheren Standard vorbelegt
			let price = msg.price = ((typeof msg.price !== 'undefined') ? msg.price : 1.00);
			let soc = msg.soc = (typeof msg.soc !== 'undefined') ? msg.soc : 90;
			let minPrice = msg.minimum = ((typeof msg.minimum !== 'undefined') ? msg.minimum : feedin);
			let estimatedHousehold = msg.energy_req = (typeof msg.energy_req !== 'undefined') ? msg.energy_req : 7000;
			let pvforecast = msg.pvforecast = (typeof msg.pvforecast !== 'undefined') ? msg.pvforecast : 16000;
			let avgPrice = ((typeof msg.average !== 'undefined') ? msg.average : 0.25);
			let avgPriceWeekly = ((typeof msg.avgGridPriceWeekly !== 'undefined') ? msg.avgGridPriceWeekly : avgPrice);

			// auch Ausgabewerte
			let lastGridchargePrice = msg.lastGridchargePrice = (typeof msg.lastGridchargePrice !== 'undefined') ? msg.lastGridchargePrice : feedin;

			// Maximum zur Steuerung heranziehen: Glättung des Verbrauches
			let batteryControlLimit = msg.batteryControlLimit = Math.max(lastGridchargePrice, avgPriceWeekly);
			const loss = 1 + ((100 - efficiency) / 100);

			// interne Berechnung überschreiben, wenn es einen externen Schätzer gibt
			const estimator = (typeof msg.estimator !== "undefined") ? true : false;

			// Hilfsfunktionen
			function isWinter(month) {
				return (month >= 11 || month <= 2); // November bis Februar
			}

			function mayChargeBattery(price, minTotal, avgPrice) {
				let ret = price <= minTotal && (price * loss) < avgPrice;
				if (debug) { node.warn(`loss is ${loss}; return is ${ret}`); }
				return ret;
			}

			function evaluateEstimator(estimator) {
				if (debug) node.warn("externe Prognose aktiv");

				// Aktuelle Zeit
				const currentTime = new Date();

				// Funktion, um den Modus effizient zu ermitteln
				function getCurrentMode(currentTime, data) {
					return data.reduce((currentMode, entry) => {
						const startTime = new Date(entry.start);
						const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 Stunde hinzufügen
						if (currentTime >= startTime && currentTime < endTime) {
							currentMode = entry.mode;
						}
						return currentMode;
					}, 'undefined');
				}

				// Modus für die aktuelle Zeit ermitteln
				let batteryMode = 'unknown';
				const mode = getCurrentMode(currentTime, estimator);
				if (debug) { node.warn("Der Modus für die aktuelle Zeit ist: " + mode); }

				if (mode !== 'undefined') {
					batteryMode = mode;
				}
				return batteryMode;
			}

			function checkGrichargeReset() {
				// Zurücksetzen des letzten Ladepreises bei geringem/hohem Füllstand
				switch (socControlMode) {
					case "highSOC":
						if (debug) { node.warn(`socControlMode is highSOC`); }
						if (soc > resetmaxsoc) {
							if (debug) { node.warn(`soc (${soc}) > resetmaxsoc (${resetmaxsoc})`); }
							lastGridchargePrice = feedin * loss;
						}
						break;
					case "lowSOC":
						if (debug) { node.warn(`socControlMode is lowSOC`); }
						if (soc < resetminsoc) {
							if (debug) { node.warn(`soc (${soc}) < resetminsoc (${resetminsoc})`); }
							lastGridchargePrice = feedin * loss;
						}
						break;
					case "mediumSOC":
						if (debug) { node.warn(`socControlMode is mediumSOC`); }
						break;
				}
			}

			// Initialisiere msg.batterymode, falls nicht vorhanden
			if (typeof msg.batterymode === 'undefined') {
				msg.batterymode = "unknown";
			}

			// Bewertung des Batteriestandes
			let socControlMode;
			if (soc > disableGridchargeThreshold) {
				if (debug) { node.warn(`soc (${soc}) > disableGridchargeThreshold (${disableGridchargeThreshold})`); }
				socControlMode = "highSOC";
			} else if (soc <= enableGridchargeThreshold) {
				if (debug) { node.warn(`soc (${soc}) <= enableGridchargeThreshold (${enableGridchargeThreshold})`); }
				socControlMode = "lowSOC";
			} else {
				if (debug) { node.warn(`soc (${soc}) is between enableGridchargeThreshold (${enableGridchargeThreshold}) and disableGridchargeThreshold (${disableGridchargeThreshold})`); }
				socControlMode = "mediumSOC";
			}

			// wenn Optimierung der Batterienutzung wirtschaftlich bzw. erlaubt
			if (!estimator) {
				if (optimize) {
					if (debug) { node.warn(`optimize is true`); }

					// Prüfung, ob Netzladungspreis zurückgesetzt werden muss
					if (msg.batterymode != "charge") {
						checkGrichargeReset();
					}

					// Wintermonate?
					let winterMode = isWinter((new Date()).getMonth());
					if (debug) { node.warn(`winterMode is ${winterMode}`); }

					// Bestimmung von pvControlMode
					let pvControlMode;
					if (winterMode) {
						msg.estimatedConsumption = (batteryCapacity - (msg.soc / 100 * batteryCapacity) + estimatedHousehold);
						if (debug) { node.warn(`estimatedConsumption is ${msg.estimatedConsumption}`); }
						pvControlMode = (pvforecast < msg.estimatedConsumption) ? "insufficientPV" : "sufficientPV";
					} else {
						pvControlMode = "sufficientPV";
					}
					if (debug) { node.warn(`pvControlMode is ${pvControlMode}`); }

					// Logik für Netzladung bei günstigem Strompreis
					if (pvControlMode === "insufficientPV" && pvControlMode !== "highSOC") {
						if (debug) { node.warn(`pvControlMode is insufficientPV and not highSOC`); }
						msg.targetMode = "hold";
						// Netzladung erlauben?
						if ((socControlMode === "lowSOC") || (socControlMode === "mediumSOC") && (msg.batterymode === "charge")) {
							if (debug) { node.warn(`socControlMode is ${socControlMode} and batterymode is ${msg.batterymode}`); }
							let minTotal = minPrice ? parseFloat((minPrice * 1.02).toFixed(3)) : 0;
							if (debug) { node.warn(`minTotal is ${minTotal} and enableGridcharge is ${enableGridcharge}, price is ${price}, avgPrice is ${avgPrice}`); }
							if (enableGridcharge && mayChargeBattery(price, minTotal, avgPrice)) {
								if (debug) { node.warn(`gridcharge, enableGridcharge is true and mayChargeBattery returns true`); }
								msg.targetMode = "charge";
								let gridchargePrice = (price * loss);
								if (debug) { node.warn(`gridchargePrice is ${gridchargePrice}`); }
								// teuersten Preis speichern
								if (gridchargePrice > lastGridchargePrice) {
									if (debug) { node.warn(`gridchargePrice (${gridchargePrice}) > lastGridchargePrice (${lastGridchargePrice})`); }
									lastGridchargePrice = gridchargePrice;
								}
							}
							if (debug) { node.warn(`no gridcharge, targetMode evaluates to ${msg.targetMode}`); }
						}
						// Batterie darf entladen, wenn Strompreis hoch und Batterie nicht teuer geladen wurde
						if (price > batteryControlLimit && price > lastGridchargePrice) {
							if (debug) { node.warn(`price (${price}) > batteryControlLimit (${batteryControlLimit}) and price > lastGridchargePrice (${lastGridchargePrice})`); }
							msg.targetMode = "normal";
						}
					} else {
						// Batterie darf entladen, wenn PV Leistung des Tages ausreicht
						if (debug) { node.warn(`pvControlMode is sufficientPV or highSOC`); }
						msg.targetMode = "normal";
					}
				} else {
					if (debug) { node.warn(`optimize is false`); }
					// Batterie darf entladen, wenn Opti
					msg.targetMode = "normal";
				}
			} else {
				// externe Ermittlung berücktsichtigen, überschreibt alle Berechnungen
				msg.targetMode = evaluateEstimator(msg.estimator);
				if (socControlMode == "highSOC") {
					if (debug) { node.warn(`Batteriestand ist hoch, keine Netzladung.`); }
					msg.targetMode = "hold";
				}
				if (msg.targetMode === "charge") {
					let gridchargePrice = (price * loss);
					if (debug) { node.warn(`gridchargePrice is ${gridchargePrice}`); }
					// teuersten Preis speichern
					if (gridchargePrice > lastGridchargePrice) {
						if (debug) { node.warn(`gridchargePrice (${gridchargePrice}) > lastGridchargePrice (${lastGridchargePrice})`); }
						lastGridchargePrice = gridchargePrice;
					}
				} else {
					checkGrichargeReset();
				}
				if (debug) { node.warn(`externe Berechnung vorgegeben, targetMode is ${msg.targetMode}`); }
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
		outputs: 3,
		outputLabels: ["Battery Mode", "Last Grid Charge Price", "Full Message"]
	});
};
