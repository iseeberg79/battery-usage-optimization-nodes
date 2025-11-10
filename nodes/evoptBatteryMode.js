const axios = require("axios");

module.exports = function (RED) {
    function EvoptBatteryModeNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.url = config.url || "http://localhost:7070/api/state";
        node.batteryIndex = config.batteryIndex !== undefined ? parseInt(config.batteryIndex) : null;
        node.batteryName = config.batteryName || "";
        node.timeIndex = parseInt(config.timeIndex) || 0;
        let debug = false;

        node.on("input", async function (msg) {
            if (typeof msg.debug !== "undefined") {
                debug = msg.debug;
            }

            let outputs = [null, null, null];

            try {
                // Fetch evopt data from EVCC API
                const response = await axios.get(node.url);
                const evoptData = response.data?.evopt;

                if (!evoptData) {
                    node.error("No evopt data found in API response", msg);
                    node.status({ fill: "red", shape: "ring", text: "No evopt data" });
                    return;
                }

                if (debug) {
                    node.warn(`evopt data received: ${JSON.stringify(evoptData)}`);
                }

                // Check if batteries array exists
                const batteries = evoptData.res?.batteries;
                const batteryDetails = evoptData.details?.batteryDetails;
                const gridImport = evoptData.res?.grid_import;
                const gridExport = evoptData.res?.grid_export;

                if (!batteries || !Array.isArray(batteries) || batteries.length === 0) {
                    node.error("No batteries found in evopt data", msg);
                    node.status({ fill: "red", shape: "ring", text: "No batteries" });
                    return;
                }

                // Determine battery index - either by name or by index
                let actualBatteryIndex = node.batteryIndex;

                if (node.batteryName) {
                    // Search by name
                    actualBatteryIndex = batteryDetails?.findIndex(bd => bd.name === node.batteryName);
                    if (actualBatteryIndex === -1 || actualBatteryIndex === undefined) {
                        node.error(`Battery with name "${node.batteryName}" not found in evopt data`, msg);
                        node.status({ fill: "red", shape: "ring", text: `No battery "${node.batteryName}"` });
                        return;
                    }
                    if (debug) {
                        node.warn(`Found battery "${node.batteryName}" at index ${actualBatteryIndex}`);
                    }
                } else if (actualBatteryIndex === null) {
                    // No index and no name specified, default to 0
                    actualBatteryIndex = 0;
                }

                // Validate index
                if (batteries.length <= actualBatteryIndex) {
                    node.error(`Battery index ${actualBatteryIndex} not found in evopt data`, msg);
                    node.status({ fill: "red", shape: "ring", text: `No battery ${actualBatteryIndex}` });
                    return;
                }

                const battery = batteries[actualBatteryIndex];
                const batteryDetail = batteryDetails?.[actualBatteryIndex];

                // Get charging and discharging power for the current time index
                const chargingPower = battery.charging_power?.[node.timeIndex] || 0;
                const dischargingPower = battery.discharging_power?.[node.timeIndex] || 0;
                const stateOfCharge = battery.state_of_charge?.[node.timeIndex] || 0;
                const gridImportValue = gridImport?.[node.timeIndex] || 0;
                const gridExportValue = gridExport?.[node.timeIndex] || 0;

                if (debug) {
                    node.warn(`Battery ${actualBatteryIndex} at time index ${node.timeIndex}:`);
                    node.warn(`  Charging Power: ${chargingPower}W`);
                    node.warn(`  Discharging Power: ${dischargingPower}W`);
                    node.warn(`  State of Charge: ${stateOfCharge}Wh`);
                    node.warn(`  Grid Import: ${gridImportValue}W`);
                    node.warn(`  Grid Export: ${gridExportValue}W`);
                }

                // Determine battery mode based on power values and grid interaction
                let batteryMode = "normal";

                if (chargingPower > 0 && gridImportValue > 0) {
                    // Battery is charging from grid
                    batteryMode = "charge";
                } else if (chargingPower === 0 && dischargingPower === 0) {
                    // Battery is not being used
                    batteryMode = "hold";
                } else {
                    // All other cases: PV charging, normal discharge for household
                    batteryMode = "normal";
                }

                // Calculate SOC percentage if battery capacity is available
                let socPercentage = null;
                if (batteryDetail?.capacity) {
                    socPercentage = parseFloat(((stateOfCharge / (batteryDetail.capacity * 1000)) * 100).toFixed(2));
                }

                // Prepare outputs
                msg.batterymode = batteryMode;
                msg.chargingPower = chargingPower;
                msg.dischargingPower = dischargingPower;
                msg.stateOfCharge = stateOfCharge;
                msg.socPercentage = socPercentage;
                msg.gridImport = gridImportValue;
                msg.gridExport = gridExportValue;
                msg.batteryDetails = batteryDetail;
                msg.batteryIndex = actualBatteryIndex;
                msg.timeIndex = node.timeIndex;

                // Output 1: Battery mode
                outputs[0] = {
                    payload: batteryMode,
                    batterymode: batteryMode,
                    chargingPower: chargingPower,
                    dischargingPower: dischargingPower,
                    gridImport: gridImportValue,
                    gridExport: gridExportValue,
                    timestamp: evoptData.details?.timestamp?.[0] || new Date().toISOString(),
                };

                // Output 2: SOC information
                outputs[1] = {
                    payload: socPercentage,
                    stateOfCharge: stateOfCharge,
                    socPercentage: socPercentage,
                    batteryCapacity: batteryDetail?.capacity || null,
                    batteryName: batteryDetail?.name || `Battery ${actualBatteryIndex}`,
                    batteryType: batteryDetail?.type || "unknown",
                };

                // Output 3: Full evopt data for debugging
                outputs[2] = {
                    payload: evoptData,
                    evopt: evoptData,
                    ...msg,
                };

                // Set node status
                switch (batteryMode) {
                    case "charge":
                        node.status({ fill: "red", shape: "dot", text: `charge (${chargingPower}W, grid: ${gridImportValue}W)` });
                        break;
                    case "hold":
                        node.status({ fill: "yellow", shape: "dot", text: "hold" });
                        break;
                    case "normal":
                        if (chargingPower > 0) {
                            node.status({ fill: "green", shape: "dot", text: `normal (charging ${chargingPower}W from PV)` });
                        } else if (dischargingPower > 0) {
                            node.status({ fill: "blue", shape: "dot", text: `normal (discharging ${dischargingPower}W)` });
                        } else {
                            node.status({ fill: "green", shape: "dot", text: "normal" });
                        }
                        break;
                }

                node.send(outputs);
            } catch (error) {
                node.error("Error fetching evopt data: " + error.message, msg);
                node.status({ fill: "red", shape: "ring", text: "API error" });
                if (debug) {
                    node.warn(`Full error: ${error.stack}`);
                }
                return;
            }
        });
    }

    RED.nodes.registerType("@iseeberg79/EvoptBatteryMode", EvoptBatteryModeNode, {
        defaults: {
            name: { value: "" },
            url: { value: "http://controller:7070/api/state" },
            batteryIndex: { value: 0 },
            timeIndex: { value: 0 },
        },
        outputs: 3,
        outputLabels: ["Battery Mode", "SOC Information", "Full evopt Data"],
    });
};
