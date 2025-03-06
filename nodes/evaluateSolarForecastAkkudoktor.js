const axios = require("axios");
module.exports = function (RED) {
    function EvaluateSolarForecastAkkudoktorNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        // Konfigurierbare URL und Parameter
        const baseUrl = config.baseUrl || "https://api.akkudoktor.net/forecast";
        let debug = false;

        const defaultParams = {
            lat: config.lat || 55.45,
            lon: config.lon || 8.14,
            azimuth: config.azimuth || 0,
            tilt: config.tilt || 35,
            power: config.power || 11,
            albedo: config.albedo || 0.2,
            powerInverter: config.powerInverter || 10000,
            inverterEfficiency: config.inverterEfficiency || 1,
        };

        node.on("input", function (msg) {
            // Debugging
            if (typeof msg.debug !== "undefined") {
                debug = msg.debug;
            }

            function transformJson(inputJson) {
                // Funktion, um die Erträge für einen bestimmten Tag zu berechnen
                function calculateTotalForDay(day) {
                    return forecasts.reduce((sum, item) => {
                        const startDate = new Date(item.period_end);
                        if (startDate.toISOString().split("T")[0] === day) {
                            return sum + item.pv_estimate;
                        }
                        return sum;
                    }, 0);
                }

                // Extrahiere die Metadaten aus der Eingangs-JSON
                const forecasts = inputJson.values.flat().map((value) => ({
                    pv_estimate: value.power,
                    pv_estimate10: value.minPower || 0,
                    pv_estimate90: value.maxPower || 0,
                    period_end: value.datetime,
                    period: "PT60M",
                }));

                const now = new Date().getTime();
                const timezoneOffset = new Date().getTimezoneOffset() * 60000; // offset in milliseconds
                const today = new Date(now - timezoneOffset).toISOString().split("T")[0];
                const tomorrow = new Date(now - timezoneOffset + 24 * 3600000).toISOString().split("T")[0];

                const { todayTotal, tomorrowTotal, remainderToday } = forecasts.reduce(
                    (acc, { pv_estimate, pv_estimate10, pv_estimate90, period_end }) => {
                        const periodDate = new Date(period_end);
                        const periodDay = periodDate.toISOString().split("T")[0];
                        if (periodDay === today) {
                            if (periodDate > now) {
                                acc.remainderToday.pv_estimate += pv_estimate * 1000;
                                acc.remainderToday.pv_estimate10 += pv_estimate10 * 1000;
                                acc.remainderToday.pv_estimate90 += pv_estimate90 * 1000;
                            }
                            acc.todayTotal.pv_estimate += pv_estimate * 1000;
                            acc.todayTotal.pv_estimate10 += pv_estimate10 * 1000;
                            acc.todayTotal.pv_estimate90 += pv_estimate90 * 1000;
                        } else if (periodDay === tomorrow) {
                            acc.tomorrowTotal.pv_estimate += pv_estimate * 1000;
                            acc.tomorrowTotal.pv_estimate10 += pv_estimate10 * 1000;
                            acc.tomorrowTotal.pv_estimate90 += pv_estimate90 * 1000;
                        }
                        return acc;
                    },
                    {
                        todayTotal: { pv_estimate: 0, pv_estimate10: 0, pv_estimate90: 0 },
                        tomorrowTotal: { pv_estimate: 0, pv_estimate10: 0, pv_estimate90: 0 },
                        remainderToday: { pv_estimate: 0, pv_estimate10: 0, pv_estimate90: 0 },
                    },
                );

                // Erstelle das transformierte JSON
                const transformedJson = {
                    forecasts: forecasts,
                    lastchange: inputJson.meta.lastchange || Date.now(),
                    today: Math.floor(todayTotal.pv_estimate * 100) / 100,
                    remain: Math.floor(remainderToday.pv_estimate * 100) / 100,
                    tomorrow: Math.floor(tomorrowTotal.pv_estimate * 100) / 100,
                };

                return transformedJson;
            }

            // Kombiniere Konfigurationsparameter und Nachrichtenflussparameter
            const params = {
                ...defaultParams,
                ...msg.input,
            };

            // Erstelle die API-URL mit den Query-Parametern
            const apiUrl =
                `${baseUrl}?` +
                `lat=${params.lat}&lon=${params.lon}&power=${params.power}` +
                `&azimuth=${params.azimuth}&tilt=${params.tilt}` +
                `&timecycle=hourly` +
                `&albedo=${params.albedo}` +
                `&powerInverter=${params.powerInverter}` +
                `&inverterEfficiency=${params.inverterEfficiency}`;

            if (debug) {
                node.warn("URL: " + apiUrl);
            }

            try {
                // Mach eine GET-Anfrage an die API mit Axios
                axios
                    .get(apiUrl, {
                        headers: {
                            Accept: "application/json",
                        },
                    })
                    .then((response) => {
                        msg.payload = transformJson(response.data);
                        node.send(msg);
                    })
                    .catch((error) => {
                        node.error("Fehler: " + error.message);
                    });
            } catch (error) {
                node.error("Fehler im try-catch: " + error.message);
            }
        });
    }

    RED.nodes.registerType("@iseeberg79/EvaluateSolarForecastAkkudoktor", EvaluateSolarForecastAkkudoktorNode, {
        settings: {
            baseUrl: { value: "https://api.akkudoktor.net/forecast" },
            lat: { value: 55.45 },
            lon: { value: 8.14 },
            azimuth: { value: 0 },
            tilt: { value: 35 },
            power: { value: 11 },
            albedo: { value: 0.2 },
            powerInverter: { value: 10000 },
            inverterEfficiency: { value: 1 },
        },
    });
};
