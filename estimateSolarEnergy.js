module.exports = function(RED) {
    function EstimateSolarEnergyNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.on('input', function(msg) {
            if (Array.isArray(msg.payload.estimations) && msg.payload.estimations.length > 0) {
                // Überprüfung von msg.civilDusk
                let civilDusk;
                if (msg.civilDusk) {
                    civilDusk = (new Date(msg.civilDusk)).getTime();
                } else {
                    civilDusk = (new Date()).setHours(24, 0, 0, 0);
                }

                // Within Time Switch
                const currentTime = (new Date()).getTime();
                const startTime = (new Date()).setHours(0, 0, 0, 0);

                if (currentTime >= startTime && currentTime <= civilDusk) {
                    // Map Function
                    const millis = new Date().getTime();
                    msg.diff = millis - msg.payload.lastchange;

                    const current = new Date().getHours();
                    const offset = (new Date().getTimezoneOffset()) / 60;
                    const hour = (new Date(msg.payload.estimations[0].t).getHours() + offset);
                    const n = 24 - hour;
                    const h = current - hour;

                    const today = msg.today = msg.payload.estimations.map(estimation => estimation.y).slice(0, (n * 2));
                    const tomorrow = msg.tomorrow = (msg.payload.estimations.map(estimation => estimation.y).slice((n * 2), (n * 2) + 48)).slice();
                    const remain = msg.remain = today.slice((h * 2));

                    const sum_today = today.reduce((acc, val) => acc + val, 0);
                    msg.payload.today = Math.round(sum_today / 2);

                    // Calculator - Sum
                    const sum_remain = remain.reduce((acc, val) => acc + val, 0);
                    msg.payload.remain = Math.round(sum_remain / 2);

                    const sum_tomorrow = tomorrow.reduce((acc, val) => acc + val, 0);
                    msg.payload.tomorrow = Math.round(sum_tomorrow / 2);

                } else {
                    // Change Node - Kein Ertrag
                    msg.pvforecast_now = 0;
                }
            }
            node.send(msg);
        });
    }
    RED.nodes.registerType('@iseeberg79/EstimateSolarEnergy', EstimateSolarEnergyNode, {
        defaults: {
            name: { value: "" }
        }
    });
}

