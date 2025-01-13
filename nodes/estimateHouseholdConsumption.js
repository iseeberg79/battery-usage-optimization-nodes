module.exports = function(RED) {
    function EstimateHouseholdConsumptionNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.on('input', function(msg) {
            const current = (new Date()).getHours();
            const n = 24 - current;
            const h = current;
            const t = 8;
            // msg.n = n;

            let profile = (typeof msg.profile !== 'undefined') ? msg.profile : [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 1, 1, 0.4, 0.4, 0.4, 0.4, 1, 1, 0.4, 0.4, 0.4, 1, 1, 1, 1, 1, 0.4, 0.4];

            const remain = profile.slice(h);
            const tomorrow = profile.slice(0, t);
            msg.payload = { profile, remain, tomorrow };

            if (n > 1) {
                const sum_today = remain.reduce((acc, val) => acc + val, 0);
                const sum_tomorrow = tomorrow.reduce((acc, val) => acc + val, 0);

                msg.payload.energy_req = Math.round((sum_today + sum_tomorrow) * 1000);
                msg.payload.energy_req_today = Math.round(sum_today * 1000);
            } else {
                msg.payload.energy_req = msg.payload.energy_req_today = remain[0];
            }
            node.send(msg);
        });
    }
    RED.nodes.registerType('@iseeberg79/EstimateHouseholdConsumption', EstimateHouseholdConsumptionNode, {
        defaults: {
            name: { value: "" }
        }
    });
};
