module.exports = function (RED) {
    function PrepareForecastDataNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Konfigurationsparameter
        const exportPrice = parseFloat(config.exportPrice) || 0.079;
        const timeInterval = config.timeInterval || "1h"; // "1h" oder "15m"
        let debug = false;

        node.on("input", function (msg) {
            // Debugging
            if (typeof msg.debug !== "undefined") {
                debug = msg.debug;
            }

            try {
                // Input validation
                if (!msg.input || typeof msg.input !== "object") {
                    node.error("msg.input object is required", msg);
                    node.status({ fill: "red", shape: "ring", text: "missing input" });
                    return;
                }

                // Schritt 1: 15min → Stundenwerte (falls nötig)
                let priceData = msg.input.priceData15 || msg.input.priceData;

                if (msg.input.priceData15 && timeInterval === "1h") {
                    if (debug) {
                        node.warn("Converting 15min price data to hourly averages");
                    }
                    priceData = convert15MinToHourly(msg.input.priceData15, debug);
                    msg.input.priceData = priceData;
                }

                // Schritt 2: PV-Forecasts kombinieren (falls zwei Arrays vorhanden)
                let pvForecast = msg.input.pvforecast;

                if (msg.pvforecast1 && msg.pvforecast2) {
                    if (debug) {
                        node.warn("Combining two PV forecasts");
                    }
                    pvForecast = combinePVForecasts(msg.pvforecast1, msg.pvforecast2, debug);
                    msg.input.pvforecast = pvForecast;
                    delete msg.pvforecast1;
                    delete msg.pvforecast2;
                } else if (msg.pvforecast1) {
                    // Nur ein Forecast vorhanden
                    pvForecast = msg.pvforecast1;
                    msg.input.pvforecast = pvForecast;
                    delete msg.pvforecast1;
                } else if (msg.pvforecast2) {
                    // Nur zweiter Forecast vorhanden
                    pvForecast = msg.pvforecast2;
                    msg.input.pvforecast = pvForecast;
                    delete msg.pvforecast2;
                }

                // Schritt 3: Daten transformieren für EstimateBatterymode
                if (debug) {
                    node.warn("Transforming data for EstimateBatterymode");
                }

                // UTC Midnight verwenden statt lokaler Zeitzone
                const now = new Date();
                const startTimestamp = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
                const interval = timeInterval === "1h" ? 60 * 60 * 1000 : 15 * 60 * 1000;

                if (debug) {
                    node.warn(`Start timestamp (UTC): ${new Date(startTimestamp).toISOString()}`);
                }

                const transformedData = {
                    priceData: transformPriceData(priceData, exportPrice, debug),
                    productionForecast: transformProductionForecast(pvForecast, debug),
                    consumptionForecast: transformConsumptionForecast(msg.input.household, startTimestamp, interval, debug),
                    soc: msg.input.soc || 0,
                };

                // Cleanup und Output
                delete msg.input;
                msg.payload = transformedData;

                node.status({ fill: "green", shape: "dot", text: "ready" });
                node.send(msg);
            } catch (error) {
                node.error("Error preparing forecast data: " + error.message, msg);
                node.status({ fill: "red", shape: "ring", text: "error" });
                if (debug) {
                    node.warn("Full error: " + error.stack);
                }
            }
        });

        // Hilfsfunktion: 15min → Stundenwerte (Durchschnitt)
        function convert15MinToHourly(data, debug) {
            let grouped = {};

            for (let entry of data) {
                // Zeit in JS-Datum umwandeln
                let d = new Date(entry.start);

                // Ganze Stunde als Schlüssel (UTC!)
                d.setMinutes(0, 0, 0);
                let hourKey = d.toISOString();

                if (!grouped[hourKey]) grouped[hourKey] = [];
                grouped[hourKey].push(entry.value || entry.price);
            }

            // Stundenmittel berechnen
            let result = Object.keys(grouped)
                .sort()
                .map((k) => {
                    let values = grouped[k];
                    let avg = values.reduce((a, b) => a + b, 0) / values.length;
                    return {
                        start: k,
                        end: new Date(new Date(k).getTime() + 60 * 60 * 1000).toISOString(),
                        value: parseFloat(avg.toFixed(4)),
                        price: parseFloat(avg.toFixed(4)),
                    };
                });

            if (debug) {
                node.warn(`Converted ${data.length} 15min entries to ${result.length} hourly entries`);
            }

            return result;
        }

        // Hilfsfunktion: Zwei PV-Forecasts kombinieren
        function combinePVForecasts(forecast1, forecast2, debug) {
            const combined = forecast1.map((f1) => {
                const f2 = forecast2.find((f) => f.period_end === f1.period_end);
                return {
                    pv_estimate: f1.pv_estimate + (f2 ? f2.pv_estimate : 0),
                    pv_estimate10: f1.pv_estimate10 + (f2 ? f2.pv_estimate10 : 0),
                    pv_estimate90: f1.pv_estimate90 + (f2 ? f2.pv_estimate90 : 0),
                    period_end: f1.period_end,
                    period: f1.period,
                };
            });

            if (debug) {
                node.warn(`Combined ${forecast1.length} + ${forecast2.length} forecasts into ${combined.length} entries`);
            }

            return combined;
        }

        // Hilfsfunktion: Preisdaten transformieren
        function transformPriceData(data, exportPrice, debug) {
            if (!data || !Array.isArray(data)) {
                throw new Error("priceData must be an array");
            }

            return data.map((item) => ({
                value: item.price || item.value,
                start: item.start,
                exportPrice: exportPrice,
                importPrice: item.price || item.value,
            }));
        }

        // Hilfsfunktion: ISO 8601 Period zu Millisekunden
        function parsePeriod(period) {
            if (!period) return 30 * 60 * 1000; // Fallback: 30 Minuten

            // Parse ISO 8601 duration (z.B. "PT30M", "PT1H", "PT15M")
            const match = period.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (!match) return 30 * 60 * 1000; // Fallback

            const hours = parseInt(match[1] || 0);
            const minutes = parseInt(match[2] || 0);
            const seconds = parseInt(match[3] || 0);

            return (hours * 3600 + minutes * 60 + seconds) * 1000;
        }

        // Hilfsfunktion: PV-Produktionsprognose transformieren
        function transformProductionForecast(data, debug) {
            if (!data || !Array.isArray(data)) {
                throw new Error("productionForecast must be an array");
            }

            return data.map((item) => {
                const periodEnd = new Date(item.period_end);
                const periodDuration = parsePeriod(item.period);
                const periodStart = new Date(periodEnd.getTime() - periodDuration);

                if (debug && data.indexOf(item) === 0) {
                    node.warn(`PV Forecast: period_end=${item.period_end}, period=${item.period}, calculated start=${periodStart.toISOString()}`);
                }

                return {
                    start: periodStart.toISOString(),
                    value: item.pv_estimate,
                };
            });
        }

        // Hilfsfunktion: Verbrauchsprognose transformieren
        function transformConsumptionForecast(data, startTimestamp, interval, debug) {
            if (!data || !Array.isArray(data)) {
                throw new Error("consumptionForecast must be an array");
            }

            return data.map((value, index) => ({
                start: new Date(startTimestamp + index * interval).toISOString(),
                value: value,
            }));
        }
    }

    RED.nodes.registerType("@iseeberg79/PrepareForecastData", PrepareForecastDataNode, {
        defaults: {
            name: { value: "" },
            exportPrice: { value: 0.079, exportable: true },
            timeInterval: { value: "1h", exportable: true },
        },
        inputs: 1,
        outputs: 1,
    });
};
