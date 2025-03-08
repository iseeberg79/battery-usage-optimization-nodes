// Module: tibber-api-prices.js
module.exports = function (RED) {
    function TibberApiPrices(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const axios = require("axios");

        node.on("input", async function (msg) {
            const accessToken = typeof msg.accessToken !== "undefined" ? msg.accessToken : config.accessToken;

            if (!accessToken) {
                node.error("Access Token is missing.");
                return;
            }

            msg.url = "https://api.tibber.com/v1-beta/gql";

            const query = `query {
                viewer {
                    homes {
                        currentSubscription {
                            priceInfo {
                                today {
                                    total
                                    energy
                                    tax
                                    startsAt
                                }
                                tomorrow {
                                    total
                                    energy
                                    tax
                                    startsAt
                                }
                            }
                        }
                    }
                }
            }`;

            try {
                const response = await axios.post(
                    msg.url,
                    { query },
                    {
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${accessToken}`,
                        },
                    },
                );

                const prices = [];

                // Combine today's and tomorrow's prices
                const homes = response.data.data.viewer.homes;
                if (!homes || homes.length === 0) {
                    node.error("No home data available", msg);
                    return;
                }

                const priceInfo = homes[0].currentSubscription.priceInfo;
                const todayPrices = priceInfo.today || [];
                const tomorrowPrices = priceInfo.tomorrow || [];

                [...todayPrices, ...tomorrowPrices].forEach((price, index, array) => {
                    if (index < array.length - 1) {
                        prices.push({
                            start: price.startsAt,
                            end: array[index + 1].startsAt,
                            price: price.total,
                        });
                    }
                });

                msg.payload = { prices };

                node.send(msg);
            } catch (error) {
                node.error("general error: " + error.message, msg);
            }
        });
    }

    RED.nodes.registerType("@iseeberg79/tibber-api-prices", TibberApiPrices, {
        credentials: {
            accessToken: { type: "text" },
        },
    });
};
