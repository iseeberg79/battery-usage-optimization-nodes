module.exports = function (RED) {
    function CombinePVForecastsNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        let debug = false;

        node.on("input", function (msg) {
            // Debugging
            if (typeof msg.debug !== "undefined") {
                debug = msg.debug;
            }

            try {
                // Validierung: Mindestens ein Forecast muss vorhanden sein
                const forecast1 = msg.payload.forecast1 || msg.forecast1;
                const forecast2 = msg.payload.forecast2 || msg.forecast2;

                if (!forecast1 && !forecast2) {
                    node.error("At least one forecast (forecast1 or forecast2) is required", msg);
                    node.status({ fill: "red", shape: "ring", text: "no forecasts" });
                    return;
                }

                // Wenn nur ein Forecast vorhanden ist, einfach weitergeben
                if (!forecast2) {
                    if (debug) {
                        node.warn("Only forecast1 provided, passing through");
                    }
                    msg.payload = forecast1;
                    node.status({ fill: "green", shape: "dot", text: "1 forecast" });
                    node.send(msg);
                    return;
                }

                if (!forecast1) {
                    if (debug) {
                        node.warn("Only forecast2 provided, passing through");
                    }
                    msg.payload = forecast2;
                    node.status({ fill: "green", shape: "dot", text: "1 forecast" });
                    node.send(msg);
                    return;
                }

                // Beide Forecasts vorhanden - kombinieren
                if (debug) {
                    node.warn(`Combining forecast1 (${forecast1.length} entries) with forecast2 (${forecast2.length} entries)`);
                }

                const combined = combineForecastArrays(forecast1, forecast2, debug);

                msg.payload = combined;
                node.status({ fill: "green", shape: "dot", text: `combined: ${combined.length} entries` });

                // Cleanup
                delete msg.forecast1;
                delete msg.forecast2;

                node.send(msg);
            } catch (error) {
                node.error("Error combining PV forecasts: " + error.message, msg);
                node.status({ fill: "red", shape: "ring", text: "error" });
                if (debug) {
                    node.warn("Full error: " + error.stack);
                }
            }
        });

        /**
         * Kombiniert zwei PV-Forecast-Arrays
         * @param {Array} forecast1 - Erster Forecast (z.B. Dach 1)
         * @param {Array} forecast2 - Zweiter Forecast (z.B. Dach 2)
         * @param {Boolean} debug - Debug-Modus
         * @returns {Array} Kombinierter Forecast
         */
        function combineForecastArrays(forecast1, forecast2, debug) {
            if (!Array.isArray(forecast1) || !Array.isArray(forecast2)) {
                throw new Error("Both forecasts must be arrays");
            }

            // Erstelle eine Map für schnelleren Lookup von forecast2
            const forecast2Map = new Map();
            forecast2.forEach((f) => {
                const key = f.period_end || f.start;
                if (key) {
                    forecast2Map.set(key, f);
                }
            });

            // Kombiniere die Forecasts
            const combined = forecast1.map((f1) => {
                const key = f1.period_end || f1.start;
                const f2 = forecast2Map.get(key);

                if (f2) {
                    // Beide Forecasts haben Daten für diesen Zeitpunkt
                    return {
                        pv_estimate: (f1.pv_estimate || 0) + (f2.pv_estimate || 0),
                        pv_estimate10: (f1.pv_estimate10 || 0) + (f2.pv_estimate10 || 0),
                        pv_estimate90: (f1.pv_estimate90 || 0) + (f2.pv_estimate90 || 0),
                        period_end: f1.period_end || f1.start,
                        period: f1.period,
                    };
                } else {
                    // Nur forecast1 hat Daten für diesen Zeitpunkt
                    if (debug) {
                        node.warn(`No matching entry in forecast2 for ${key}, using only forecast1`);
                    }
                    return {
                        pv_estimate: f1.pv_estimate || 0,
                        pv_estimate10: f1.pv_estimate10 || 0,
                        pv_estimate90: f1.pv_estimate90 || 0,
                        period_end: f1.period_end || f1.start,
                        period: f1.period,
                    };
                }
            });

            // Füge Einträge aus forecast2 hinzu, die nicht in forecast1 vorhanden sind
            forecast2.forEach((f2) => {
                const key = f2.period_end || f2.start;
                const existsInForecast1 = forecast1.some((f1) => (f1.period_end || f1.start) === key);

                if (!existsInForecast1) {
                    if (debug) {
                        node.warn(`Adding entry from forecast2 that was missing in forecast1: ${key}`);
                    }
                    combined.push({
                        pv_estimate: f2.pv_estimate || 0,
                        pv_estimate10: f2.pv_estimate10 || 0,
                        pv_estimate90: f2.pv_estimate90 || 0,
                        period_end: f2.period_end || f2.start,
                        period: f2.period,
                    });
                }
            });

            // Sortiere nach Zeitstempel
            combined.sort((a, b) => {
                const timeA = new Date(a.period_end || a.start).getTime();
                const timeB = new Date(b.period_end || b.start).getTime();
                return timeA - timeB;
            });

            if (debug) {
                node.warn(`Combined ${forecast1.length} + ${forecast2.length} forecasts into ${combined.length} entries`);
            }

            return combined;
        }
    }

    RED.nodes.registerType("@iseeberg79/CombinePVForecasts", CombinePVForecastsNode);
};
