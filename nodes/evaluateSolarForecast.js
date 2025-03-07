const axios = require("axios");
module.exports = function (RED) {
    function EvaluateSolarForecastNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.rooftopid = config.rooftopid;
        node.token = config.token;
        node.url = config.url;

        node.on("input", async function (msg) {
            const rooftopid = typeof msg.rooftopid !== "undefined" ? msg.rooftopid : node.rooftopid || "invalid";
            const token = typeof msg.token !== "undefined" ? msg.token : node.token || "invalid";
            const url = typeof msg.url !== "undefined" ? msg.url : node.url || "https://api.solcast.com.au/rooftop_sites/";

            if (rooftopid === "invalid" || token === "invalid") {
                node.error("Ungültige Konfiguration: rooftopid/token", msg);
                return;
            }

            msg.url = url + `${rooftopid}/forecasts?format=json`;
            msg.headers = {
                Authorization: `Bearer ${token}`,
            };

            try {
                const response = await axios.get(msg.url, { headers: msg.headers });
                msg.payload = response.data;
            } catch (error) {
                node.error("HTTP-Anfrage Fehler: " + error, msg);
                return;
            }

            msg.payload.lastchange = new Date().getTime();

            const now = new Date().getTime();
            const timezoneOffset = new Date().getTimezoneOffset() * 60000; // offset in milliseconds
            const today = new Date(now - timezoneOffset).toISOString().split("T")[0];
            const tomorrow = new Date(now - timezoneOffset + 24 * 3600000).toISOString().split("T")[0];

            const { todayTotal, tomorrowTotal, remainderToday } = msg.payload.forecasts.reduce(
                (acc, { pv_estimate, pv_estimate10, pv_estimate90, period_end }) => {
                    const periodDate = new Date(period_end);
                    const periodDay = periodDate.toISOString().split("T")[0];
                    if (periodDay === today) {
                        if (periodDate > now) {
                            acc.remainderToday.pv_estimate += (pv_estimate * 1000) / 2;
                            acc.remainderToday.pv_estimate10 += (pv_estimate10 * 1000) / 2;
                            acc.remainderToday.pv_estimate90 += (pv_estimate90 * 1000) / 2;
                        }
                        acc.todayTotal.pv_estimate += (pv_estimate * 1000) / 2;
                        acc.todayTotal.pv_estimate10 += (pv_estimate10 * 1000) / 2;
                        acc.todayTotal.pv_estimate90 += (pv_estimate90 * 1000) / 2;
                    } else if (periodDay === tomorrow) {
                        acc.tomorrowTotal.pv_estimate += (pv_estimate * 1000) / 2;
                        acc.tomorrowTotal.pv_estimate10 += (pv_estimate10 * 1000) / 2;
                        acc.tomorrowTotal.pv_estimate90 += (pv_estimate90 * 1000) / 2;
                    }
                    return acc;
                },
                {
                    todayTotal: { pv_estimate: 0, pv_estimate10: 0, pv_estimate90: 0 },
                    tomorrowTotal: { pv_estimate: 0, pv_estimate10: 0, pv_estimate90: 0 },
                    remainderToday: { pv_estimate: 0, pv_estimate10: 0, pv_estimate90: 0 },
                },
            );

            msg.payload.today = Math.round(todayTotal.pv_estimate);
            msg.payload.remain = Math.round(remainderToday.pv_estimate);
            msg.payload.tomorrow = Math.round(tomorrowTotal.pv_estimate);
            msg.payload.lastchange = new Date().getTime();

            delete msg.token;
            delete msg.rooftopid;

            node.send(msg);
        });
    }
    RED.nodes.registerType("@iseeberg79/EvaluateSolarForecast", EvaluateSolarForecastNode, {
        defaults: {
            name: { value: "" },
        },
    });
};
