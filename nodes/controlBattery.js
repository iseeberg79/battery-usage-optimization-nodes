module.exports = function(RED) {
	function ControlBattery(config) {
		RED.nodes.createNode(this, config);
		var node = this;
		node.configuredMinSoC = config.configuredMinSoC;
		node.maximumGridprice = config.maximumGridprice;
		node.configuredBatteryLock = config.configuredBatteryLock;
		const debug = true;

		node.on('input', function(msg) {

			// Hilfsfunktionen
			function isWinter(month) {
				return (month >= 11 || month <= 2); // November bis Februar
			}

			function evaluateEstimator(estimator) {
				//if (debug) node.warn("externe Prognose aktiv");
				node.warn("externe Prognose aktiv");

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
				let returnValue = 'undefined';
				const mode = getCurrentMode(currentTime, estimator);
				if (debug) { node.warn("Der Modus für die aktuelle Zeit ist: " + mode); }

				//msg.targetModeInternal = msg.targetMode;
				if (mode !== 'undefined') {
					switch (mode) {
						case "grid":
							if (msg.actualsoc > msg.configuredMinSoC) {
								returnValue = 'hold';
							} else {
								returnValue = 'normal';
							}
							break;
						case "charging":
							returnValue = 'hold';
							break;
						case "battery":
							returnValue = 'normal';
							break;
					}
				}
				return returnValue;
			}

			// Wintermonate?
			const winterMode = isWinter((new Date()).getMonth());

			msg.configuredMinSoC = (typeof msg.configuredMinSoC !== 'undefined') ? msg.configuredMinSoC : node.configuredMinSoC || 5;

			// Sicherheitsbegrenzung zur Netzladung
			msg.maximumGridprice = (typeof msg.maximumGridprice !== 'undefined') ? msg.maximumGridprice : node.maximumGridprice || 0.35;
			msg.batteryLock = (typeof msg.batteryLock !== 'undefined') ? msg.batteryLock : node.configuredBatteryLock || false;

			msg.optimize = (typeof msg.optimize !== 'undefined') ? msg.optimize : false;
			msg.batterymode = (typeof msg.batterymode !== 'undefined') ? msg.batterymode : "normal";
			msg.evccBatteryMode = (typeof msg.evccBatteryMode !== 'undefined') ? msg.evccBatteryMode : "unknown";

			msg.price = ((typeof msg.price !== 'undefined') ? msg.price : 0.50);
			msg.minsoc = (typeof msg.minsoc !== 'undefined') ? msg.minsoc : 20;
			msg.actualsoc = (typeof msg.actualsoc !== 'undefined') ? msg.actualsoc : 80;

			let outputs = [null, null, null, null];

			if (msg.batteryLock) {
				node.warn("Sperre: Batterieoptimierung deaktiviert!");
			}


			if (winterMode) {
				if (debug) { node.warn(`Winter mode is active`); }
				// Im Winter die Mindestladung erhöhen
				msg.configuredMinSoC = (typeof msg.forcedMinSoC !== 'undefined') ? msg.forcedMinSoC : Math.min(msg.configuredMinSoC * 3, 15);
				if (debug) { node.warn(`Configured MinSoC increased to ${msg.configuredMinSoC}`); }
			}

			// interne Berechnung überschreiben, wenn es einen externen Schätzer gibt
			const estimator = (typeof msg.estimator !== "undefined") ? msg.estimator : null;
			if ((msg.batterymode != "charge") && (estimator != null)) {
				msg.batterymodeInternal = msg.batterymode;
				msg.batterymode = evaluateEstimator(estimator);
			}

			if (!msg.batteryLock) {
				if (debug) { node.warn(`Battery lock is not active`); }
				if (msg.evccBatteryMode === 'charge') {
					if (debug) { node.warn(`EVCC Battery Mode is charge`); }
					msg.effectiveFeedin = msg.price;
					if (!msg.optimize) {
						if (debug) { node.warn(`Optimize is false`); }
						msg.targetMode = msg.evccBatteryMode;
						outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
						node.status({ fill: "red", shape: "dot", text: msg.targetMode });
					} else {
						if (debug) { node.warn(`Optimize is true`); }
						msg.targetMode = msg.batterymode;
						if (msg.batterymode === 'charge') {
							if (debug) { node.warn(`Battery mode is charge`); }
							outputs[0] = { payload: 100 };
							outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
							node.status({ fill: "red", shape: "dot", text: msg.targetMode });
						} else {
							if (debug) { node.warn(`Battery mode is not charge`); }
							outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
							outputs[2] = { payload: 0.00 };
							node.status({ fill: "red", shape: "dot", text: msg.targetMode });
						}
					}
				}

				if ((msg.evccBatteryMode === 'unknown') || (msg.evccBatteryMode === 'normal')) {
					if (debug) { node.warn(`EVCC Battery Mode is ${msg.evccBatteryMode}`); }
					if (!msg.optimize) {
						if (debug) { node.warn(`Optimize is false`); }
						msg.targetMode = msg.evccBatteryMode;
						if (msg.targetMode != "unknown") {
							outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
						}
						if ((msg.minsoc > 20) && (msg.minsoc != msg.configuredMinSoC)) {
							outputs[0] = { payload: msg.configuredMinSoC };
						}
						node.status({ fill: "green", shape: "dot", text: msg.targetMode });
					} else {
						if (debug) { node.warn(`Optimize is true`); }
						if ((msg.batterymode === 'hold') || ((msg.batterymode === 'charge') && (msg.price > msg.maximumGridprice))) {
							if (debug) { node.warn(`Battery mode is hold or charge with price > maximumGridprice`); }
							msg.targetMode = 'hold';
							outputs[0] = { payload: 100 };
							outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
							node.status({ fill: "orange", shape: "dot", text: msg.targetMode });
						}
						if ((msg.batterymode === 'charge') && (msg.price <= msg.maximumGridprice)) {
							if (debug) { node.warn(`Battery mode is charge with price <= maximumGridprice`); }
							msg.targetMode = msg.batterymode;
							outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
							outputs[2] = { payload: msg.price };
							node.status({ fill: "red", shape: "dot", text: msg.targetMode });
						}
						if ((msg.batterymode === 'normal') || (msg.batterymode === 'unknown')) {
							if (debug) { node.warn(`Battery mode is normal or unknown`); }
							msg.targetMode = 'normal';
							if ((msg.minsoc > 20) && (msg.minsoc != msg.configuredMinSoC)) {
								outputs[0] = { payload: msg.configuredMinSoC };
							}
							outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
							node.status({ fill: "green", shape: "dot", text: msg.targetMode });
						}
					}
				}

				if (msg.evccBatteryMode === 'hold') {
					if (debug) { node.warn(`EVCC Battery Mode is hold`); }
					msg.targetMode = 'hold';
					outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
					node.status({ fill: "orange", shape: "dot", text: msg.targetMode });
				}

				outputs[3] = msg;
			} else {
				node.warn("UI Sperre: forcierte Batteriesperre!");
				if (msg.optimize) {
					if (debug) { node.warn(`Optimize is true with battery lock`); }
					msg.targetMode = 'hold';
					outputs[0] = { payload: 100 };
					outputs[1] = { payload: msg.targetMode, optimize: false };
					node.status({ fill: "orange", shape: "dot", text: msg.targetMode });
				}
			}

			// Zeitstempel der Änderung vermerken
			if ((msg.evccBatteryMode != "unknown") && (msg.evccBatteryMode != msg.targetMode)) {
				if (outputs[0] !== null) { outputs[0].ts = msg.changedAt = (new Date()).getTime(); }
				if (outputs[1] !== null) { outputs[1].ts = msg.changedAt; }
				msg.changed = true;
			} else {
				msg.changed = false;
			}

			msg = outputs;
			node.send(msg);

		});
	}

	RED.nodes.registerType('@iseeberg79/ControlBattery', ControlBattery, {
		defaults: {
			name: { value: "" },
			configuredMinSoC: { value: 5 },
			maximumGridprice: { value: 0.35 },
			configuredBatteryLock: { value: false }
		},
		inputs: 1,
		outputs: 4,
		outputLabels: ["MinSoC", "Mode", "Price", "Full Message"]
	});
};
