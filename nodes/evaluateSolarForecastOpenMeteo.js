const axios = require("axios");
module.exports = function (RED) {
    function EvaluateSolarForecastOpenMeteoNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        // Konfigurierbare URL und Parameter
        const baseUrl = config.baseUrl || "https://api.open-meteo.com/v1/forecast";
        let debug = false;

        const defaultParams = {
            lat: config.lat || 53.81,
            lon: config.lon || 7.33,
            azimuth: config.azimuth || 60,
            tilt: config.tilt || 50,
            power: config.power || 11,
            efficiency: config.efficiency || 0.9, // Kombinierter Effizienzparameter
            models: config.models || "icon_seamless",
            timezone: config.timezone || "GMT",
            hourly: config.hourly || ["shortwave_radiation", "shortwave_radiation_instant"],
        };

        node.on("input", function (msg) {
            // Debugging
            if (typeof msg.debug !== "undefined") {
                debug = msg.debug;
            }

            // Kombiniere Konfigurationsparameter und Nachrichtenflussparameter
            const params = {
                ...defaultParams,
                ...msg.input,
            };

            // Erstelle die API-URL mit den Query-Parametern
            const apiUrl =
                `${baseUrl}?` +
                `latitude=${params.lat}&longitude=${params.lon}` +
                `&hourly=${params.hourly.join(",")}` +
                `&timezone=${params.timezone}` +
                `&tilt=${params.tilt}&azimuth=${params.azimuth}` +
                `&models=${params.models}`;

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
                        const forecasts = response.data.hourly.time.map((timestamp, index) => {
                            const ghi = response.data.hourly.shortwave_radiation[index];
                            const pvPower = ghi * params.power * params.efficiency;
                            return {
                                start: timestamp,
                                value: (pvPower / 1000).toFixed(2), // Leistung in kW
                            };
                        });

                        msg.payload = forecasts;
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

    RED.nodes.registerType("@iseeberg79/EvaluateSolarForecastOpenMeteo", EvaluateSolarForecastOpenMeteoNode, {
        settings: {
            baseUrl: { value: "https://api.open-meteo.com/v1/forecast" },
            lat: { value: 53.81 },
            lon: { value: 7.33 },
            azimuth: { value: 60 },
            tilt: { value: 50 },
            power: { value: 11 },
            efficiency: { value: 0.9 }, // Kombinierter Effizienzparameter
            models: { value: "icon_seamless" },
            timezone: { value: "GMT" },
            hourly: { value: ["shortwave_radiation", "shortwave_radiation_instant"] },
        },
    });
};
