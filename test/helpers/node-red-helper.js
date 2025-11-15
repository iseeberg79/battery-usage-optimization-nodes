/**
 * Helper für Node-RED Node Tests
 * Basiert auf node-red-node-test-helper Pattern
 */

class NodeRedHelper {
    constructor() {
        this.nodes = new Map();
        this.flows = [];
    }

    /**
     * Erstellt einen Mock für einen Node-RED Node
     */
    createNode(type, id = 'n1') {
        const events = {};
        const node = {
            id,
            type,
            name: '',
            status: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            log: jest.fn(),
            send: jest.fn(),
            on: jest.fn((event, handler) => {
                events[event] = handler;
            }),
            _events: events,
            // Simuliert Input-Ereignis
            receive: function(msg) {
                if (events.input) {
                    events.input.call(this, msg);
                }
            }
        };

        this.nodes.set(id, node);
        return node;
    }

    /**
     * Erstellt einen Mock für RED (Node-RED Runtime)
     */
    createRED() {
        const self = this;
        return {
            nodes: {
                createNode: jest.fn((node, config) => {
                    Object.assign(node, config);
                }),
                registerType: jest.fn()
            },
            util: {
                generateId: jest.fn(() => Math.random().toString(36).substring(7))
            },
            // Helper für Tests
            _test: {
                getNode: (id) => self.nodes.get(id),
                getNodes: () => Array.from(self.nodes.values())
            }
        };
    }

    /**
     * Wartet auf ein Event oder Timeout
     */
    async waitForEvent(node, eventName, timeout = 1000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Timeout waiting for event: ${eventName}`));
            }, timeout);

            const originalOn = node.on;
            node.on = jest.fn((event, handler) => {
                if (event === eventName) {
                    const wrappedHandler = (...args) => {
                        clearTimeout(timer);
                        handler(...args);
                        resolve(args);
                    };
                    originalOn.call(node, event, wrappedHandler);
                } else {
                    originalOn.call(node, event, handler);
                }
            });
        });
    }

    /**
     * Bereinigt alle Nodes
     */
    cleanup() {
        this.nodes.clear();
        this.flows = [];
    }
}

module.exports = NodeRedHelper;
