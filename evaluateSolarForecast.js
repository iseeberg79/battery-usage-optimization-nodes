module.exports = function(RED) {
    const axios = require('axios');
    
    function EvaluateSolarForecastNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.rooftopid = config.rooftopid;
        node.token = config.token;

        node.on('input', async function(msg) {
            // ID & credentials
            const rooftopid = msg.rooftopid || node.rooftopid || "invalid"; // Standardwert
            const token = msg.token || node.token || "invalid"; // Standardwert

            if ((rooftopid === "invalid") || (token === "invalid")) {
                node.error('ungültige Konfiguration: rooftopid/token', msg);
                return;
            }

            // Prepare Request
            msg.url = `https://api.solcast.com.au/rooftop_sites/${rooftopid}/forecasts?format=json`;
            msg.headers = {
                "Authorization": `Bearer ${token}`
            };

            // HTTP Request - Fetch Forecast
            try {
                const response = await axios.get(msg.url, { headers: msg.headers });
                msg.payload = response.data;
            } catch (error) {
                node.error('HTTP-Anfrage Fehler: ' + error, msg);
                return;
            }

            // Transform JSON
            let data = msg.payload.forecasts;
            data = data.map(entry => {
                return {
                    y: entry.pv_estimate * 1000,
                    t: Date.parse(entry.period_end) ? new Date(entry.period_end).getTime() : null,
                    y10: entry.pv_estimate10 * 1000,
                    y90: entry.pv_estimate90 * 1000
                };
            });

            msg.payload.lastchange = new Date().getTime();
            msg.payload.estimations = data;

            // Map Function
            const currentTime = (new Date()).getTime();
            const current = new Date().getHours();
            const offset = (new Date().getTimezoneOffset()) / 60;
            const hour = (new Date(msg.payload.estimations[0].t).getHours() + offset);
            const n = 24 - hour;
            const h = current - hour;

            const today = msg.payload.estimations.map(estimation => estimation.y).slice(0, (n * 2));

            // Calculator - heute
            const sum_today = today.reduce((acc, val) => acc + val, 0);
            msg.payload.today = Math.round(sum_today / 2);

            const tomorrow = (msg.payload.estimations.map(estimation => estimation.y).slice((n * 2), (n * 2) + 48)).slice();
            const remain = today.slice((h * 2));

            // Calculator - verbleibend
            const sum_remain = remain.reduce((acc, val) => acc + val, 0);
            msg.payload.remain = Math.round(sum_remain / 2);

            // Calculator - morgen
            const sum_tomorrow = tomorrow.reduce((acc, val) => acc + val, 0);
            msg.payload.tomorrow = Math.round(sum_tomorrow / 2);

            // Clean-up
            delete msg.payload.forecasts;
            delete msg.token;
            delete msg.rooftopid;

            node.send(msg);
        });
    }
    RED.nodes.registerType('@iseeberg79/EvaluateSolarForecast', EvaluateSolarForecastNode, {
        defaults: {
            name: { value: "" },
            rooftopid: { value: "defaultRooftopID" },
            token: { value: "defaultToken" }
        },
        inputs: 1,
        outputs: 1,
        icon: "file.png",
        label: function() {
            return this.name || "Evaluate Solar Forecast";
        }
    });
}

