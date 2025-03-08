const axios = require("axios");
module.exports = function (RED) {
    function EvaluateSolarForecastOpenMeteoNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // implementation is based on evcc solar tariff template for open-meteo API
        node.url = config.url || "https://api.open-meteo.com/v1/forecast";
        node.lat = config.lat;
        node.lon = config.lon;
        node.az = config.az;
        node.dec = config.dec;
        node.ac = config.ac || 10000;
        node.efficiency = config.efficiency || 100;
        node.alphatemp = config.alphatemp || -0.004;
        node.rossmodel = config.rossmodel || 0.026;
        node.kwp = config.kwp || 11;
        node.days = config.days || 3;

        node.on("input", async function (msg) {
            const url = typeof msg.url !== "undefined" ? msg.url : node.url;
            const lat = typeof msg.lat !== "undefined" ? msg.lat : node.lat || "invalid";
            const lon = typeof msg.lon !== "undefined" ? msg.lon : node.lon || "invalid";
            const az = typeof msg.az !== "undefined" ? msg.az : node.az || "invalid";
            const dec = typeof msg.dec !== "undefined" ? msg.dec : node.dec || "invalid";
            const ac = typeof msg.ac !== "undefined" ? msg.ac : node.ac;
            const efficiency = typeof msg.efficiency !== "undefined" ? msg.efficiency : node.efficiency;
            const alphatemp = typeof msg.alphatemp !== "undefined" ? msg.alphatemp : node.alphatemp;
            const rossmodel = typeof msg.rossmodel !== "undefined" ? msg.rossmodel : node.rossmodel;
            const kwp = typeof msg.kwp !== "undefined" ? msg.kwp : node.kwp;
            const days = typeof msg.days !== "undefined" ? msg.days : node.days;

            if (lat === "invalid" || lon === "invalid" || az === "invalid" || dec === "invalid") {
                node.error("invalid configuration: lat/lon/az/dec", msg);
                return;
            }

            const fullUrl = `${url}?latitude=${lat}&longitude=${lon}&azimuth=${az}&tilt=${dec}&hourly=temperature_2m,global_tilted_irradiance&forecast_days=${days}&timezone=GMT&timeformat=unixtime`;

            try {
                const response = await axios.get(fullUrl);

                // Sicherstellen, dass `msg.payload` ein Objekt ist
                if (typeof msg.payload !== "object" || msg.payload === null) {
                    msg.payload = {};
                }

                // Überprüfen, ob `response.data` die erwartete Struktur hat
                if (!response.data || typeof response.data !== "object" || !response.data.hourly) {
                    node.error("invalid API response", msg);
                    return;
                }

                msg.payload.result = response.data;
            } catch (error) {
                node.error("HTTP-Anfrage Fehler: " + error, msg);
                return;
            }

            function transformData(payload, { alphatemp, rossmodel, efficiency, kwp, ac }) {
                const limit = (min, x, max) => (x < min ? min : x > max ? max : x);

                if (!payload.hourly.time || !payload.hourly.global_tilted_irradiance) {
                    node.error("invalid API response data", msg);
                    return [];
                }

                const transformedData = payload.hourly.time.map((time, index) => {
                    const globalTiltedIrradiance = payload.hourly.global_tilted_irradiance[index];
                    const temperature = payload.hourly.temperature_2m ? payload.hourly.temperature_2m[index] : 25; // Beispielwert für Temperatur
                    const period_end = new Date(time * 1000);

                    return {
                        //ISO timestamp
                        start: new Date(period_end.getTime() - 3600000).toISOString().replace(/\.\d{1,7}Z$/, "Z"),
                        end: period_end.toISOString().replace(/\.\d{1,7}Z$/, "Z"),
                        pv_estimate: Math.round(
                            limit(
                                0,
                                kwp *
                                    1000 *
                                    (globalTiltedIrradiance / 1000) *
                                    (1 +
                                        alphatemp *
                                            ((temperature + (payload.hourly.temperature_2m[index - 1] || temperature)) / 2 + (globalTiltedIrradiance / 800.0) * rossmodel - 25.0)) *
                                    (efficiency / 100),
                                ac,
                            ),
                        ),
                    };
                });

                return transformedData;
            }

            try {
                // Hier kommt die Konvertierung und die Berechnung der Erträge
                msg.payload.forecast = transformData(msg.payload.result, {
                    alphatemp,
                    rossmodel,
                    efficiency,
                    kwp,
                    ac,
                });

                // Berechnung der Erträge
                const now = new Date().getTime();
                const timezoneOffset = new Date().getTimezoneOffset() * 60000; // offset in milliseconds
                const today = new Date(now - timezoneOffset).toISOString().split("T")[0];
                const tomorrow = new Date(now - timezoneOffset + 24 * 3600000).toISOString().split("T")[0];

                if (!Array.isArray(msg.payload.forecast)) {
                    node.error("invalid structure: msg.payload.forecast is not an array", msg);
                    return;
                }

                const { todayTotal, tomorrowTotal, remainderToday } = msg.payload.forecast.reduce(
                    (acc, { pv_estimate, end }) => {
                        const periodDate = new Date(end);
                        const periodDay = periodDate.toISOString().split("T")[0];
                        if (periodDay === today) {
                            if (periodDate > now) {
                                acc.remainderToday.pv_estimate += pv_estimate || 0;
                            }
                            acc.todayTotal.pv_estimate += pv_estimate || 0;
                        } else if (periodDay === tomorrow) {
                            acc.tomorrowTotal.pv_estimate += pv_estimate || 0;
                        }
                        return acc;
                    },
                    {
                        todayTotal: { pv_estimate: 0 },
                        tomorrowTotal: { pv_estimate: 0 },
                        remainderToday: { pv_estimate: 0 },
                    },
                );

                // cleanup
                delete msg.payload.result;

                msg.payload.today = Math.round(todayTotal.pv_estimate);
                msg.payload.remain = Math.round(remainderToday.pv_estimate);
                msg.payload.tomorrow = Math.round(tomorrowTotal.pv_estimate);
                msg.payload.lastchange = new Date().getTime();

                node.send(msg);
            } catch (error) {
                node.error("general error: " + error, msg);
                return;
            }
        });
    }
    RED.nodes.registerType("@iseeberg79/EvaluateSolarForecastOpenMeteo", EvaluateSolarForecastOpenMeteoNode, {
        defaults: {
            name: { value: "" },
            url: { value: "https://api.open-meteo.com/v1/forecast" },
            lat: { value: 55.33 },
            lon: { value: 7.81 },
            az: { value: 0 },
            dec: { value: 30 },
            ac: { value: 10000 },
            efficiency: { value: 100 },
            alphatemp: { value: -0.004 },
            rossmodel: { value: 0.026 },
            kwp: { value: 11 },
            days: { value: 3 },
        },
    });
};
