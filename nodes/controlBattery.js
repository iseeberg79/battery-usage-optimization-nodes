module.exports = function(RED) {
    function ControlBattery(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.configuredMinSoC = config.configuredMinSoC;
        node.maximumGridprice = config.maximumGridprice;
        node.configuredBatteryLock = config.configuredBatteryLock;

        node.on('input', function(msg) {
			
			// Hilfsfunktionen
			function isWinter(month) {
				return (month >= 11 || month <= 2); // November bis Februar
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
				// Im Winter die Mindestladung erhöhen
				msg.configuredMinSoC = Math.min(msg.configuredMinSoC*3, 15);
			}

            if (!msg.batteryLock) {
                if (msg.evccBatteryMode === 'charge') {
                    msg.effectiveFeedin = msg.price;
                    if (!msg.optimize) {
                        msg.targetMode = msg.evccBatteryMode;
                        outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
                        node.status({ fill: "red", shape: "dot", text: msg.targetMode });
                    } else {
                        msg.targetMode = msg.batterymode;
                        if (msg.batterymode === 'charge') {
                            outputs[0] = { payload: 100 };
                            outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
                            node.status({ fill: "red", shape: "dot", text: msg.targetMode });
                        } else {
                            outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
                            outputs[2] = { payload: 0.00 };
                            node.status({ fill: "red", shape: "dot", text: msg.targetMode });
                        }
                    }
                }

                if ((msg.evccBatteryMode === 'unknown') || (msg.evccBatteryMode === 'normal')) {
                    if (!msg.optimize) {
                        msg.targetMode = msg.evccBatteryMode;
                        if (msg.targetMode != "unknown") {
                            outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
                        }
                        if ((msg.minsoc > 20) && (msg.minsoc != msg.configuredMinSoC)) {
                            outputs[0] = { payload: msg.configuredMinSoC };
                        }
                        node.status({ fill: "green", shape: "dot", text: msg.targetMode });
                    } else {
                        if ((msg.batterymode === 'hold') || ((msg.batterymode === 'charge') && (msg.price > msg.maximumGridprice))) {
                            msg.targetMode = 'hold';
                            outputs[0] = { payload: 100 };
                            outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
                            node.status({ fill: "orange", shape: "dot", text: msg.targetMode });
                        }
                        if ((msg.batterymode === 'charge') && (msg.price <= msg.maximumGridprice)) {
                            msg.targetMode = msg.batterymode;
                            outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
                            outputs[2] = { payload: msg.price };
                            node.status({ fill: "red", shape: "dot", text: msg.targetMode });
                        }
                        if ((msg.batterymode === 'normal') || (msg.batterymode === 'unknown')) {
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
                    msg.targetMode = 'hold';
                    outputs[1] = { payload: msg.targetMode, optimize: msg.optimize };
                    node.status({ fill: "orange", shape: "dot", text: msg.targetMode });
                }

                outputs[3] = msg;
            } else {
                node.warn("UI Sperre: forcierte Batteriesperre!");
                if (msg.optimize) {
                    msg.targetMode = 'hold';
                    outputs[0] = { payload: 100 };
                    outputs[1] = { payload: msg.targetMode, optimize: false };
                    node.status({ fill: "orange", shape: "dot", text: msg.targetMode });
                }
            }

			// Zeitstempel der Änderung vermerken
			if ((msg.evccBatteryMode != "unknown") && (msg.evccBatteryMode != msg.targetMode)) {
			    outputs[0].ts = msg.changedAt = (new Date()).getTime();
				outputs[1].ts = msg.changedAt;
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
        outputs: 4
    });
};

